import { bookingStatus, seatStatus, type Seat } from "../db/generated/prisma/client.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../db/index.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const getLastSeatNumberForPool = async (poolId: number) => {

    const LastPool = await prisma.pool.findFirst({
        where: {
            id: {
                lt: poolId
            }

        }, orderBy: {
            id: "desc"
        }
    })

    if (!LastPool) {
        console.log("no previous pool found for seat look up ")
        return 0
    }
    console.log(LastPool)
    const prefix = ["A", "B", "C", "D"];

    const lastSeats = await Promise.all(
        prefix.map((p) =>
            prisma.seat.findFirst({
                where: {
                    poolId: LastPool?.id,
                    name: { startsWith: p },
                },
                orderBy: { name: "desc" }, // safe now — same prefix, so "A099" < "A100" ✅
            })
        )
    );

    const numbers = lastSeats.map((seat) => {
        if (!seat) return 0;
        const match = seat.name.match(/[A-Z](\d+)/);
        return match?.[1] ? parseInt(match[1], 10) : 0;
    });

    return Math.max(...numbers); // return the highest number across all rows
};


export const generateSeatNameForNewPool = (numberOfSeats: number, startFrom: number = 0) => {
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
            const seatNumber = startFrom + j; // continue from last number
            const padded = String(seatNumber).padStart(3, "0");
            seatNames.push(`${prefix[i]}${padded}`);
        }
    }

    return seatNames;
};


export const createSeatsforPoolHelper = async (poolid: number, seatNumber: number) => {
    const lastNumber = await getLastSeatNumberForPool(poolid);
    const seatNames = generateSeatNameForNewPool(seatNumber, lastNumber);

    const seatData = seatNames.map((name) => ({
        name,
        poolId: poolid,
    }));

    const createdSeats = await prisma.seat.createMany({
        data: seatData,

    });

    return createdSeats;
};
const createSeatsforPool = asyncHandler(async (req: any, res: any) => {

    const { poolid, priceperSeat, seatNumber } = req.body;

    if (!poolid || !priceperSeat || !seatNumber) {
        throw new ApiError(400, "PoolId, pricePerSeat and seatNumber are required");
    }
    const createdSeats = await createSeatsforPoolHelper(poolid, seatNumber);
    return createdSeats;

})

const getPoolSeats = asyncHandler(async (req: any, res: any) => {
    const { poolid } = req.params;

    if (!poolid) {
        throw new ApiError(400, "PoolId is required");
    }
    const poolDB = await prisma.pool.findUnique({
        where: {
            publicId: poolid
        },
        select: {
            id: true
        }
    })
    if (!poolDB) {
        throw new ApiError(404, "pool does not exist")
    }
    const seats = await prisma.seat.findMany({
        where: {
            poolId: poolDB.id

        }, select: {
            name: true,
            status: true,
            publicId: true
        }
    })
    return res.status(200).json(new ApiResponse(200, seats, "Seats retrieved successfully"));
});

const verifySeatStatus = async (seatids: string[]) => {
    const seats = await prisma.seat.findMany({
        where: {
            publicId: { in: seatids }
        }
        , select: {
            publicId: true,
            status: true
        }
    })
    const unavailableSeats = seats.filter(seat => seat.status !== "AVAILABLE").map(seat => seat.publicId);
    if (unavailableSeats.length > 0) {
        throw new ApiError(400, `The following seats are not available: ${unavailableSeats.join(", ")}`);

    }
    return seats
}

const getSeatDetailsByIDForAdmin = asyncHandler(async (req: any, res: any) => {
    const { seatid } = req.params;

    if (!seatid) {
        throw new ApiError(400, "SeatId is required");
    }

    const seat = await prisma.seat.findUnique({
        where: {
            publicId: seatid
        }
        ,select:{
            name:true,
            status:true,
            booking:{
                select:{
                    amount:true,
                    providerPaymentId:true,
                    status:true,
                    seats:{
                            select:{name:true,
                            publicId:true
                            }
                    },
                    user:{
                        select:{
                            name:true,
                            phone:true
                        }
                    }
                }
            }
        }
    });

    if(!seat){
        throw new ApiError(404, "Seat not found");
    }
    

    
    // Convert BigInt phone to string for JSON serialization

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



})



const updateSeatStatus = async(bookingId: string, Bookingstatus: string)=>{

    let FinalSeatStatus;

switch (Bookingstatus) {
    case bookingStatus.COMPLETED:
        
    FinalSeatStatus = seatStatus.SOLD
        break;
    case bookingStatus.FAILED:
    FinalSeatStatus = seatStatus.AVAILABLE
        break;
    default:
    FinalSeatStatus = seatStatus.AVAILABLE
        break;
}

    const updatedSeats = await prisma.seat.updateMany({
        where: {
            bookingId: bookingId
        },
        data: {
            status: FinalSeatStatus
        }
    });
    return updatedSeats;

}

export { createSeatsforPool, getPoolSeats, verifySeatStatus ,getSeatDetailsByIDForAdmin,updateSeatStatus}