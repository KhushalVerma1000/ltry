import { RoundStatus, LedgerEntryType, LedgerDirection, PayoutVerificationStatus, BookingStatus } from "../db/generated/prisma/enums.js";
import { prisma } from "../db/index.js";
import { recordLedgerEntry } from "../services/ledger.service.js";
import { recordAdminAudit } from "../services/auditLog.service.js";
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

    // PUBLIC route: seat and prize only. Winners' phone / bank / UPI details
    // are admin-only (see getWinnersForRoundAdmin).
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



// ADMIN route: winners with the payout details needed to pay them, plus the
// user's payout-verification status. The winner is whoever holds the seat's
// live COMPLETED booking (seat.booking), NOT the BookingSeat history, which
// also contains abandoned or failed attempts by other users.
// One query (Prisma batches the nested relations), no per-winner lookups.
const getWinnersForRoundAdmin = asyncHandler(async (req: any, res: any) => {
    const { poolId, roundId } = req.params;

    if (!poolId || !roundId) {
        throw new ApiError(400, "poolId and roundId are required");
    }

    const round = await prisma.poolRound.findFirst({
        where: { publicId: roundId, pool: { publicId: poolId } },
        select: { id: true }
    });

    if (!round) {
        throw new ApiError(404, "Round not found for this pool");
    }

    const winners = await prisma.winner.findMany({
        where: { roundId: round.id },
        orderBy: { position: "asc" },
        select: {
            id: true,
            position: true,
            prize: true,
            paid: true,
            paidAt: true,
            seat: {
                select: {
                    name: true,
                    publicId: true,
                    booking: {
                        select: {
                            id: true,
                            status: true,
                            providerOrderId: true,
                            user: {
                                select: {
                                    publicId: true,
                                    name: true,
                                    phone: true,
                                    bankAccountNumber: true,
                                    bankIFSCCode: true,
                                    upiId: true,
                                    payoutVerification: true,
                                    payoutVerificationNote: true
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    const data = winners.map((w) => {
        const booking = w.seat.booking;
        const claimed = booking && booking.status === BookingStatus.COMPLETED ? booking : null;
        return {
            id: w.id,
            position: w.position,
            prize: w.prize,
            paid: w.paid,
            paidAt: w.paidAt,
            seat: { name: w.seat.name, publicId: w.seat.publicId },
            bookingId: claimed?.id ?? null,
            providerOrderId: claimed?.providerOrderId ?? null,
            user: claimed?.user ?? null
        };
    });

    return res.status(200).json(new ApiResponse(200, data, "Winners fetched successfully"));
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
        where: {
            poolId: pool.id,
            round: {
                status: { in: [RoundStatus.DRAWING, RoundStatus.ACTIVE] }
            }
        },
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
    const adminId = req.admin?.id;

    if (!winnerId) {
        throw new ApiError(400, "Winner ID is required");
    }
    const winnerIdNum = parseInt(winnerId, 10);
    if (!Number.isInteger(winnerIdNum)) {
        throw new ApiError(400, "Winner ID must be a number");
    }
    if (!adminId) {
        throw new ApiError(401, "Unauthorized");
    }

    const updatedWinner = await prisma.$transaction(async (tx) => {
        const winner = await tx.winner.findUnique({
            where: { id: winnerIdNum },
            select: {
                id: true,
                prize: true,
                paid: true,
                seat: {
                    select: {
                        booking: {
                            select: {
                                status: true,
                                userId: true,
                                user: { select: { payoutVerification: true } }
                            }
                        }
                    }
                }
            }
        });

        if (!winner) {
            throw new ApiError(404, "Winner not found");
        }

        if (winner.paid) {
            throw new ApiError(400, "Winner has already been marked as paid");
        }

        const booking = winner.seat?.booking;
        if (!booking?.userId || booking.status !== BookingStatus.COMPLETED) {
            throw new ApiError(400, "Winning seat has no completed booking/user to pay");
        }

        // Manual payout-verification gate: no prize is paid to a user whose
        // bank/UPI details an admin has not checked and marked VERIFIED.
        if (booking.user.payoutVerification !== PayoutVerificationStatus.VERIFIED) {
            throw new ApiError(
                409,
                "This winner's payout details are not verified. Verify them under Payout verification first."
            );
        }

        // Atomic gate: only one concurrent request can flip paid false -> true,
        // so a double click can't write two sets of ledger entries.
        const gate = await tx.winner.updateMany({
            where: { id: winnerIdNum, paid: false },
            data: { paid: true, paidAt: new Date() }
        });

        if (gate.count === 0) {
            throw new ApiError(400, "Winner has already been marked as paid");
        }

        const result = await tx.winner.findUniqueOrThrow({
            where: { id: winnerIdNum },
            select: {
                id: true,
                position: true,
                prize: true,
                paid: true,
                paidAt: true
            }
        });

        // Two entries, same pattern as a seat purchase (see booking.controllers.ts):
        //   1. CREDIT WINNER_PAYOUT  -> the prize won, "money in"
        //   2. DEBIT  WITHDRAWAL -> the prize withdrawn by the winner
        // Credit first so the debit's non-negative-balance guard is satisfied.
        await recordLedgerEntry(tx, {
            userId: booking.userId,
            type: LedgerEntryType.WINNER_PAYOUT,
            direction: LedgerDirection.CREDIT,
            amount: winner.prize,
            referenceType: "WINNER",
            referenceId: String(winner.id),
            description: `Prize won (winner ${winner.id})`
        });

        await recordLedgerEntry(tx, {
            userId: booking.userId,
            type: LedgerEntryType.WITHDRAWAL,
            direction: LedgerDirection.DEBIT,
            amount: winner.prize,
            referenceType: "WINNER",
            referenceId: String(winner.id),
            description: `Prize withdrawal (winner ${winner.id})`
        });

        await recordAdminAudit(tx, {
            adminId,
            action: "WINNER_MARKED_PAID",
            targetType: "WINNER",
            targetId: String(winner.id),
            details: { prize: String(winner.prize), userId: booking.userId }
        });

        return result;
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



export { getWinnersForRound, getWinnersForRoundAdmin, getWinnersForPool, markWinnerPaid, createWinner };