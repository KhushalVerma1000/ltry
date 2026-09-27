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
 *
 * INVARIANT: a user's walletBalance can never go negative. A DEBIT is only
 * applied if the balance can cover it (see the `updateMany` guard below) —
 * otherwise this throws a 400 and the whole calling transaction rolls back.
 *
 * Because of that invariant, any flow that both takes a payment AND spends
 * it in one step (e.g. a direct ticket purchase, with no pre-existing wallet
 * balance) MUST record two entries in the same transaction, in this order:
 *   1. CREDIT (type WALLET_TOPUP) for the amount actually paid in
 *   2. DEBIT (type BOOKING_PAYMENT, etc.) for the amount being spent
 * Crediting first means the debit's guard always sees a covered balance for
 * a same-amount purchase, while still leaving a real, auditable "money in"
 * row — the same row shape a future top-up-then-spend flow will produce.
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

    // `amount` is typed as `number | string`, but callers also legitimately
    // pass a Prisma Decimal field straight through (e.g. `updatedBooking.amount`
    // below in booking.controllers.ts). A Decimal is an object, not a number
    // or string, so the old `: amount` fallback left it unconverted and
    // `Number.isFinite()` on a Decimal object is always false — every call
    // with a Decimal amount would have thrown "amount must be a positive
    // number" instead of recording the entry. `Number(amount)` correctly
    // converts a Decimal (its `valueOf()` returns the decimal string), a
    // numeric string, or a plain number.
    const parsedAmount = typeof amount === "string" ? parseFloat(amount) : Number(amount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new ApiError(400, "Ledger entry amount must be a positive number");
    }

    const delta = direction === LedgerDirection.CREDIT ? parsedAmount : -parsedAmount;

    // For a DEBIT, only apply the update if the current balance can cover it.
    // `updateMany` with `walletBalance: { gte: parsedAmount }` in the WHERE
    // clause makes the "check current balance, then write" a single atomic
    // statement at the DB level, so it's race-safe under concurrent debits
    // for the same user (Postgres row-locks the row for the duration of the
    // UPDATE, so a second concurrent debit re-evaluates the WHERE against
    // the value the first one just committed, not a stale read).
    //
    // A CREDIT never needs this guard since `parsedAmount` is already
    // validated as positive above.
    const result = await tx.user.updateMany({
        where: {
            id: userId,
            ...(direction === LedgerDirection.DEBIT
                ? { walletBalance: { gte: parsedAmount } }
                : {})
        },
        data: { walletBalance: { increment: delta } }
    });

    if (result.count === 0) {
        throw new ApiError(
            400,
            "Insufficient wallet balance. Credit the amount to the wallet before debiting it."
        );
    }

    // Still inside the same transaction, so this row is the one we just
    // wrote and is locked until commit — safe to read back for balanceAfter.
    const updatedUser = await tx.user.findUniqueOrThrow({
        where: { id: userId },
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
