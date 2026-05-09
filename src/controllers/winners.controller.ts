import { prisma } from "../db/index.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getWinnersForRound = asyncHandler(async (req: any, res: any) => {
    const { poolId, roundId } = req.params;

    if (!poolId || !roundId) {
        throw new ApiError(400, "poolId and roundId are required");
    }

    const pool = await prisma.pool.findUnique({
        where: { publicId: poolId },
        select: { id: true }
    });

    if (!pool) {
        throw new ApiError(404, "Pool not found");
    }

    const round = await prisma.poolRound.findUnique({
        where: { publicId: roundId },
        select: { id: true }
    });

    if (!round) {
        throw new ApiError(404, "Round not found");
    }

    const winners = await prisma.winner.findMany({
        where: { 
            roundId: round.id,
            poolId: pool.id
        },
        orderBy: {
            position: "asc"
        },
        select: {
            id: true,
            position: true,
            prize: true,
            paid: true,
            paidAt: true,
            seat: {
                select: {
                    id: true,
                    name: true,
                    publicId: true,
                    bookedSeats: {
                        select: {
                            booking: {
                                select: {
                                    id: true,
                                    providerOrderId: true,
                                    user: {
                                        select: {
                                            name: true,
                                            phone: true,
                                            bankAccountNumber: true,
                                            bankIFSCCode: true,
                                            upiId: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    return res.status(200).json(
        new ApiResponse(200, winners, "Winners fetched successfully")
    );
});



const getWinnersForPool = asyncHandler(async (req: any, res: any) => {
    const { poolId } = req.params;

    if (!poolId) {
        throw new ApiError(400, "poolId is required");
    }

    const pool = await prisma.pool.findUnique({
        where: { publicId: poolId },
        select: { id: true }
    });

    if (!pool) {
        throw new ApiError(404, "Pool not found");
    }

    const winners = await prisma.winner.findMany({
        where: { poolId: pool.id },
        orderBy: [
            { roundId: "desc" },
            { position: "asc" }
        ],
        select: {
            id: true,
            position: true,
            prize: true,
            paid: true,
            paidAt: true,
            round: {
                select: {
                    publicId: true,
                    roundNumber: true
                }
            },
            seat: {
                select: {
                    id: true,
                    name: true,
                    publicId: true
                }
            }
        }
    });

    return res.status(200).json(
        new ApiResponse(200, winners, "Winners fetched successfully")
    );
});

const markWinnerPaid = asyncHandler(async (req: any, res: any) => {
    const { winnerId } = req.params;

    if (!winnerId) {
        throw new ApiError(400, "Winner ID is required");
    }

    const winner = await prisma.winner.findUnique({
        where: { id: parseInt(winnerId) }
    });

    if (!winner) {
        throw new ApiError(404, "Winner not found");
    }

    const updatedWinner = await prisma.winner.update({
        where: { id: parseInt(winnerId) },
        data: {
            paid: true,
            paidAt: new Date()
        },
        select: {
            id: true,
            position: true,
            prize: true,
            paid: true,
            paidAt: true
        }
    });

    return res.status(200).json(
        new ApiResponse(200, updatedWinner, "Winner marked as paid")
    );
});

const createWinner = asyncHandler(async (req: any, res: any) => {
    const { poolId, roundId, seatId, position, prize } = req.body;

    if (!poolId || !roundId || !seatId || !position || !prize) {
        throw new ApiError(400, "poolId, roundId, seatId, position, and prize are required");
    }

    const pool = await prisma.pool.findUnique({
        where: { publicId: poolId },
        select: { id: true }
    });

    if (!pool) {
        throw new ApiError(404, "Pool not found");
    }

    const round = await prisma.poolRound.findUnique({
        where: { publicId: roundId },
        select: { id: true }
    });

    if (!round) {
        throw new ApiError(404, "Round not found");
    }

    const seat = await prisma.seat.findUnique({
        where: { publicId: seatId },
        select: { id: true }
    });

    if (!seat) {
        throw new ApiError(404, "Seat not found");
    }

    // Check if position already exists for this round
    const existingWinner = await prisma.winner.findFirst({
        where: {
            roundId: round.id,
            position: parseInt(position)
        }
    });

    if (existingWinner) {
        throw new ApiError(400, "A winner for this position already exists in this round");
    }

    const winner = await prisma.winner.create({
        data: {
            roundId: round.id,
            poolId: pool.id,
            seatId: seat.id,
            position: parseInt(position),
            prize: parseFloat(prize)
        },
        select: {
            id: true,
            position: true,
            prize: true,
            paid: true,
            seat: {
                select: {
                    name: true,
                    publicId: true
                }
            }
        }
    });

    return res.status(201).json(
        new ApiResponse(201, winner, "Winner created successfully")
    );
});



export { getWinnersForRound, getWinnersForPool, markWinnerPaid, createWinner };