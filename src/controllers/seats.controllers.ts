import { BookingStatus, SeatStatus, type Seat } from "../db/generated/prisma/client.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../db/index.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const generateSeatNameForRound = (numberOfSeats: number, startFrom: number = 0) => {
    const prefix = ["A", "B", "C", "D"];
    const seatsPerRow = Math.floor(numberOfSeats / 4);
    if (seatsPerRow > 1000) {
        throw new ApiError(400, "Too many seats per row. Max is 999.");
    }
    if (numberOfSeats % 4 !== 0) {
        throw new ApiError(400, "Number of seats must be divisible by 4.");
    }
    let seatNames: string[] = [];

    for (let i = 0; i < 4; i++) {
        for (let j = 1; j <= seatsPerRow; j++) {
            const seatNumber = startFrom + j;
            const padded = String(seatNumber).padStart(3, "0");
            seatNames.push(`${prefix[i]}${padded}`);
        }
    }

    return seatNames;
};

export const createSeatsforRoundHelper = async (
    roundPublicId: string,
    poolId: number,
    roundId: string | number,
    seatNumber: number,
    prismaClient: any = prisma
) => {
    const seatNames = generateSeatNameForRound(seatNumber, 0);

    // Resolve roundId if it's a publicId
    let actualRoundId: number;
    if (typeof roundId === 'string') {
        const round = await prismaClient.poolRound.findUnique({
            where: { publicId: roundId },
            select: { id: true }
        });
        if (!round) {
            throw new ApiError(404, "Round not found");
        }
        actualRoundId = round.id;
    } else {
        actualRoundId = roundId;
    }

    const seatData = seatNames.map((name) => ({
        name,
        roundId: actualRoundId,
        poolId: poolId
    }));

    const createdSeats = await prismaClient.seat.createMany({
        data: seatData
    });

    return createdSeats;
};

// Deprecated: kept for backward compatibility
export const createSeatsforPoolHelper = async (poolid: number, seatNumber: number) => {
    throw new ApiError(500, "createSeatsforPoolHelper is deprecated. Use createSeatsforRoundHelper instead.");
};

const createSeatsforRound = asyncHandler(async (req: any, res: any) => {
    const { roundId } = req.params;
    const { seatNumber } = req.body;

    if (!roundId || !seatNumber) {
        throw new ApiError(400, "roundId and seatNumber are required");
    }

    const round = await prisma.poolRound.findUnique({
        where: { publicId: roundId },
        select: { id: true, poolId: true }
    });

    if (!round) {
        throw new ApiError(404, "Round not found");
    }

    const createdSeats = await createSeatsforRoundHelper(
        roundId,
        round.poolId,
        round.id,
        parseInt(seatNumber)
    );

    return res.status(201).json(new ApiResponse(201, createdSeats, "Seats created successfully"));
});

const getRoundSeats = asyncHandler(async (req: any, res: any) => {
    const { roundId } = req.params;

    if (!roundId) {
        throw new ApiError(400, "roundId is required");
    }

    const round = await prisma.poolRound.findUnique({
        where: { publicId: roundId },
        select: { id: true }
    });

    if (!round) {
        throw new ApiError(404, "Round not found");
    }

    const seats = await prisma.seat.findMany({
        where: { roundId: round.id },
        select: {
            publicId: true,
            name: true,
            status: true,
            bookingId: true
        },
        orderBy: { name: "asc" }
    });

    return res.status(200).json(new ApiResponse(200, seats, "Seats retrieved successfully"));
});

const getSeatDetailsByIDForAdmin = asyncHandler(async (req: any, res: any) => {
    const { seatid } = req.params;

    if (!seatid) {
        throw new ApiError(400, "SeatId is required");
    }

    const seat = await prisma.seat.findUnique({
        where: { publicId: seatid },
        select: {
            publicId: true,
            name: true,
            status: true,
            round: {
                select: {
                    publicId: true,
                    roundNumber: true
                }
            },
            booking: {
                select: {
                    id: true,
                    amount: true,
                    providerOrderId: true,
                    status: true,
                    seats: {
                        select: {
                            name: true,
                            publicId: true
                        }
                    },
                    user: {
                        select: {
                            name: true,
                            phone: true
                        }
                    }
                }
            }
        }
    });

    if (!seat) {
        throw new ApiError(404, "Seat not found");
    }

    const seatwithStringPhone = {
        ...seat,
        booking: seat.booking ? {
            ...seat.booking,
            user: seat.booking.user ? {
                ...seat.booking.user,
                phone: seat.booking.user.phone?.toString()
            } : undefined
        } : undefined
    };

    res.status(200).json(new ApiResponse(200, seatwithStringPhone, "Seat details retrieved successfully"));
});

const verifySeatStatus = async (seatids: string[]) => {
    const seats = await prisma.seat.findMany({
        where: {
            publicId: { in: seatids }
        },
        select: {
            publicId: true,
            status: true
        }
    });

    const unavailableSeats = seats.filter(seat => seat.status !== SeatStatus.AVAILABLE).map(seat => seat.publicId);
    if (unavailableSeats.length > 0) {
        throw new ApiError(400, `The following seats are not available: ${unavailableSeats.join(", ")}`);
    }

    return seats;
};

const updateSeatStatus = async (bookingId: string, bookingStatus: string, tx: any = prisma) => {
    let finalSeatStatus: SeatStatus;

    switch (bookingStatus) {
        case BookingStatus.COMPLETED:
            finalSeatStatus = SeatStatus.SOLD;
            break;
        case BookingStatus.FAILED:
            finalSeatStatus = SeatStatus.AVAILABLE;
            break;
        case BookingStatus.EXPIRED:
            finalSeatStatus = SeatStatus.AVAILABLE;
            break;
        case BookingStatus.CANCELLED:
            finalSeatStatus = SeatStatus.AVAILABLE;
            break;
        default:
            finalSeatStatus = SeatStatus.AVAILABLE;
            break;
    }

    const updatedSeats = await tx.seat.updateMany({
        where: { bookingId: bookingId },
        data: { status: finalSeatStatus }
    });

    return updatedSeats;
};

export { 
    createSeatsforRound, 
    getRoundSeats, 
    verifySeatStatus, 
    getSeatDetailsByIDForAdmin, 
    updateSeatStatus 
};