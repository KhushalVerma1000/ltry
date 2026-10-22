import {
    BookingStatus,
    SeatStatus,
    TransactionAttemptStatus,
    LedgerEntryType,
    LedgerDirection
} from "../../db/generated/prisma/client.js";
import { prisma } from "../../db/index.js";
import { recordLedgerEntry } from "../ledger.service.js";
import { ApiError } from "../../utils/ApiError.js";

/**
 * Single place where "a payment for this booking succeeded" is applied.
 *
 * Both the browser callback (POST /bookings/verifyPayment) and the Razorpay
 * webhook (POST /webhooks/razorpay) call this. Whichever arrives first does
 * the work; the other one finds the booking already COMPLETED and is a no-op.
 * That is what makes the webhook safe to retry, and stops the client callback
 * + webhook from double-writing transactions / ledger entries.
 *
 * Must be called inside `prisma.$transaction`.
 */

export type FinalizeOutcome =
    | { outcome: "COMPLETED"; bookingId: string; userId: number }
    | { outcome: "ALREADY_COMPLETED"; bookingId: string }
    // Payment was captured but the booking had already lapsed and the seats
    // were taken by someone else. Money has been received and must be refunded.
    | { outcome: "NEEDS_REFUND"; bookingId: string; userId: number; amount: string };

interface FinalizeParams {
    bookingId: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
}

const finalizeBookingPayment = async (
    tx: any,
    { bookingId, gatewayOrderId, gatewayPaymentId }: FinalizeParams
): Promise<FinalizeOutcome> => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });

    if (!booking) {
        throw new ApiError(404, "Booking not found");
    }

    if (booking.status === BookingStatus.COMPLETED) {
        return { outcome: "ALREADY_COMPLETED", bookingId };
    }

    // Atomic gate: only one caller can flip the booking to COMPLETED.
    // PENDING is the normal case. EXPIRED/FAILED are "late payment" cases:
    // the user paid after our 5-minute hold lapsed, or the checkout reported a
    // failure but the gateway actually captured the money. We still honour the
    // purchase if (and only if) the seats are still free for this booking.
    if (booking.status !== BookingStatus.PENDING) {
        const seats = await tx.seat.findMany({
            where: { bookingId: booking.id },
            select: { id: true, status: true }
        });
        const bookingSeatCount = await tx.bookingSeat.count({ where: { bookingId: booking.id } });
        const allStillOurs =
            seats.length === bookingSeatCount &&
            seats.length > 0 &&
            seats.every((s: any) => s.status !== SeatStatus.SOLD);

        if (!allStillOurs) {
            // Idempotent: payment.captured + order.paid + retries all land here.
            const alreadyLogged = await tx.transaction.findFirst({
                where: { bookingId: booking.id, gatewayPaymentId, transactionAttemptStatus: TransactionAttemptStatus.SUCCESS },
                select: { id: true }
            });
            if (!alreadyLogged) await tx.transaction.create({
                data: {
                    bookingId: booking.id,
                    paymentGateway: "RAZORPAY",
                    gatewayOrderId,
                    gatewayPaymentId,
                    transactionAttemptStatus: TransactionAttemptStatus.SUCCESS,
                    amount: booking.amount,
                    error: { note: "Late payment; seats no longer available. Refund required." }
                }
            });
            return {
                outcome: "NEEDS_REFUND",
                bookingId: booking.id,
                userId: booking.userId,
                amount: booking.amount.toString()
            };
        }
    }

    const gate = await tx.booking.updateMany({
        where: {
            id: booking.id,
            status: { in: [BookingStatus.PENDING, BookingStatus.EXPIRED, BookingStatus.FAILED] }
        },
        data: { status: BookingStatus.COMPLETED }
    });

    if (gate.count === 0) {
        // Lost the race to a concurrent caller (client callback vs webhook).
        return { outcome: "ALREADY_COMPLETED", bookingId };
    }

    await tx.transaction.create({
        data: {
            bookingId: booking.id,
            paymentGateway: "RAZORPAY",
            gatewayOrderId,
            gatewayPaymentId,
            transactionAttemptStatus: TransactionAttemptStatus.SUCCESS,
            amount: booking.amount
        }
    });

    await tx.seat.updateMany({
        where: { bookingId: booking.id },
        data: { status: SeatStatus.SOLD }
    });

    // Same two-entry pattern as before (see ledger.service.ts): money in from
    // the gateway, then money out for the ticket, so the balance never dips
    // below zero and the passbook shows both sides.
    await recordLedgerEntry(tx, {
        userId: booking.userId,
        type: LedgerEntryType.WALLET_TOPUP,
        direction: LedgerDirection.CREDIT,
        amount: booking.amount,
        referenceType: "BOOKING",
        referenceId: booking.id,
        description: `Payment received for booking ${booking.id}`
    });

    await recordLedgerEntry(tx, {
        userId: booking.userId,
        type: LedgerEntryType.BOOKING_PAYMENT,
        direction: LedgerDirection.DEBIT,
        amount: booking.amount,
        referenceType: "BOOKING",
        referenceId: booking.id,
        description: `Payment for booking ${booking.id}`
    });

    return { outcome: "COMPLETED", bookingId: booking.id, userId: booking.userId };
};

export { finalizeBookingPayment };
export const runFinalizeBookingPayment = (params: FinalizeParams) =>
    prisma.$transaction((tx: any) => finalizeBookingPayment(tx, params));
