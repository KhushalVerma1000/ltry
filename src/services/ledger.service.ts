import { LedgerDirection, LedgerEntryType } from "../db/generated/prisma/enums.js";
import { prisma } from "../db/index.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Every money movement "by" a user (they pay in, e.g. a booking) or "to" a user
 * (they receive, e.g. a winner payout / refund) must go through this service so
 * there is a single, append-only, auditable trail with a running balance.
 *
 * CREDIT  = money added to the user's ledger balance (winner payout, refund, manual credit)
 * DEBIT   = money taken from the user's ledger balance (booking payment, manual debit)
 *
 * Call this ONLY with a Prisma transaction client (the `tx` you get inside
 * `prisma.$transaction(async (tx) => { ... })`) so the balance update and the
 * ledger row are written atomically together with whatever business event
 * triggered them (booking completion, payout, etc). The row-level lock taken by
 * the `user.update` below serializes concurrent writers for the same user, so
 * `balanceAfter` is always correct even under concurrent requests.
 */

export interface RecordLedgerEntryParams {
    userId: number;
    type: LedgerEntryType;
    direction: LedgerDirection;
    amount: number | string;
    referenceType: string;
    referenceId?: string | null;
    description?: string | null;
    createdByAdminId?: string | null;
}

const recordLedgerEntry = async (tx: any, params: RecordLedgerEntryParams) => {
    const {
        userId,
        type,
        direction,
        amount,
        referenceType,
        referenceId = null,
        description = null,
        createdByAdminId = null
    } = params;

    const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new ApiError(400, "Ledger entry amount must be a positive number");
    }

    const delta = direction === LedgerDirection.CREDIT ? parsedAmount : -parsedAmount;

    // Atomically adjust the user's running balance and read back the new value.
    const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { walletBalance: { increment: delta } },
        select: { walletBalance: true }
    });

    const entry = await tx.ledgerEntry.create({
        data: {
            userId,
            type,
            direction,
            amount: parsedAmount,
            balanceAfter: updatedUser.walletBalance,
            referenceType,
            referenceId,
            description,
            createdByAdminId
        }
    });

    return entry;
};

/**
 * Convenience wrapper for callers that are not already inside a transaction.
 * Prefer `recordLedgerEntry(tx, ...)` when the ledger write must be atomic
 * with another DB change (e.g. marking a booking COMPLETED).
 */
const recordLedgerEntryStandalone = async (params: RecordLedgerEntryParams) => {
    return prisma.$transaction(async (tx) => recordLedgerEntry(tx, params));
};

const getLedgerForUser = async (
    userId: number,
    { skip, take }: { skip: number; take: number }
) => {
    const [entries, total] = await Promise.all([
        prisma.ledgerEntry.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            skip,
            take,
            select: {
                publicId: true,
                type: true,
                direction: true,
                amount: true,
                balanceAfter: true,
                referenceType: true,
                referenceId: true,
                description: true,
                createdAt: true
            }
        }),
        prisma.ledgerEntry.count({ where: { userId } })
    ]);

    return { entries, total };
};

const getCurrentBalance = async (userId: number) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { walletBalance: true }
    });

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return user.walletBalance;
};

export {
    recordLedgerEntry,
    recordLedgerEntryStandalone,
    getLedgerForUser,
    getCurrentBalance
};
