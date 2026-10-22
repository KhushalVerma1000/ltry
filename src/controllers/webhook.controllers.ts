import { BookingStatus, TransactionAttemptStatus } from "../db/generated/prisma/client.js";
import { prisma } from "../db/index.js";
import { runFinalizeBookingPayment } from "../services/paymentcollection/bookingPayment.service.js";
import { refundPayment, verifyWebhookSignature } from "../services/paymentcollection/Razerpay.service.js";

/**
 * POST /api/v1/webhooks/razorpay
 *
 * Server-to-server confirmation from Razorpay. This is the source of truth for
 * "did the user actually pay", independent of the browser: if the user closes
 * the tab, loses network, or our /verifyPayment call crashes after a successful
 * charge, the booking is still completed from here.
 *
 * Requires the RAW body (see app.ts) because the signature is computed over the
 * exact bytes Razorpay sent.
 *
 * Response codes matter: Razorpay retries any non-2xx for ~24h.
 *   401 -> bad signature (never retried successfully, and shouldn't be)
 *   200 -> handled, or intentionally ignored (unknown event / unknown order)
 *   500 -> transient failure (DB down etc.) -> let Razorpay retry
 */
const razorpayWebhook = async (req: any, res: any) => {
    const rawBody: Buffer = req.body;
    const signature = req.headers["x-razorpay-signature"] as string | undefined;

    if (!Buffer.isBuffer(rawBody) || !verifyWebhookSignature(rawBody, signature)) {
        return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    let event: any;
    try {
        event = JSON.parse(rawBody.toString("utf8"));
    } catch {
        return res.status(400).json({ success: false, message: "Invalid JSON" });
    }

    try {
        const type: string = event?.event;
        const payment = event?.payload?.payment?.entity;
        const orderId: string | undefined = payment?.order_id ?? event?.payload?.order?.entity?.id;

        // Only the events we act on. Everything else is acknowledged and ignored.
        if (!["payment.captured", "order.paid", "payment.failed"].includes(type) || !payment || !orderId) {
            return res.status(200).json({ success: true, message: "Event ignored" });
        }

        const booking = await prisma.booking.findFirst({ where: { providerOrderId: orderId } });

        if (!booking) {
            // Not one of ours (or order not yet linked). Nothing to retry for.
            console.warn(`[razorpay-webhook] ${type}: no booking for order ${orderId}`);
            return res.status(200).json({ success: true, message: "No matching booking" });
        }

        if (type === "payment.failed") {
            // A failed attempt does NOT fail the booking: Razorpay lets the user
            // retry on the same order inside the 5-minute hold. We only record
            // the attempt; expiry releases the seats if they never succeed.
            if (booking.status === BookingStatus.PENDING) {
                await prisma.transaction.create({
                    data: {
                        bookingId: booking.id,
                        paymentGateway: "RAZORPAY",
                        gatewayOrderId: orderId,
                        gatewayPaymentId: payment.id,
                        transactionAttemptStatus: TransactionAttemptStatus.FAILED,
                        amount: booking.amount,
                        error: {
                            code: payment.error_code ?? null,
                            reason: payment.error_description ?? null
                        }
                    }
                });
            }
            return res.status(200).json({ success: true, message: "Failure recorded" });
        }

        // payment.captured / order.paid
        if (payment.status !== "captured") {
            return res.status(200).json({ success: true, message: "Payment not captured yet" });
        }

        // The amount Razorpay actually charged must equal what we expected.
        // Never trust the booking alone: a mismatch means something is wrong.
        const paidPaise = Number(payment.amount);
        const expectedPaise = Math.round(Number(booking.amount) * 100);
        if (paidPaise !== expectedPaise) {
            console.error(
                `[razorpay-webhook] amount mismatch for booking ${booking.id}: paid ${paidPaise}, expected ${expectedPaise}`
            );
            return res.status(200).json({ success: true, message: "Amount mismatch; flagged" });
        }

        const result = await runFinalizeBookingPayment({
            bookingId: booking.id,
            gatewayOrderId: orderId,
            gatewayPaymentId: payment.id
        });

        if (result.outcome === "NEEDS_REFUND" && !(Number(payment.amount_refunded) > 0)) {
            // Outside the DB transaction on purpose: an external API call must
            // not hold a transaction open, and if the refund call fails we
            // still want the Transaction row (already committed) as the record.
            try {
                await refundPayment(payment.id, Number(booking.amount), booking.id);
            } catch (refundErr) {
                console.error(
                    `[razorpay-webhook] REFUND FAILED for payment ${payment.id} (booking ${booking.id}) — refund manually`,
                    refundErr
                );
            }
        }

        return res.status(200).json({ success: true, message: result.outcome });
    } catch (err) {
        console.error("[razorpay-webhook] processing error", err);
        return res.status(500).json({ success: false, message: "Webhook processing failed" });
    }
};

export { razorpayWebhook };
