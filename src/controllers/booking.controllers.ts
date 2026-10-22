import { BookingStatus, SeatStatus, TransactionAttemptStatus, RoundStatus, type Booking } from "../db/generated/prisma/client.js";
import { prisma } from "../db/index.js";
import { createorder, verifyPayment } from "../services/paymentcollection/Razerpay.service.js";
import { runFinalizeBookingPayment } from "../services/paymentcollection/bookingPayment.service.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { arrayParserStringToArray } from "../utils/converterHelper.js";
import { updateSeatStatus, verifySeatStatus ,expireStaleBookingsForRound } from "./seats.controllers.js";

const createBooking = asyncHandler(async (req: any, res: any) => {
    const userid = req.user.id;
    const { roundId, amount, seats } = req.body;

    if (!roundId || !amount || !seats) {
        throw new ApiError(400, "roundId, amount, and seats are required");
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new ApiError(400, "Invalid amount value");
    }

    const parsedSeats = arrayParserStringToArray(seats);

    const createBookingResult = await prisma.$transaction(async (txs) => {
        // Verify round exists and is active
        const round = await txs.poolRound.findUnique({
            where: { publicId: roundId },
            select: { 
                id: true, 
                poolId: true, 
                status: true,
                priceSnapshot: true,
                seatsSnapshot: true 
            }
        });

        if (!round) {
            throw new ApiError(404, "Round not found");
        }

        if (round.status !== RoundStatus.ACTIVE && round.status !== RoundStatus.UPCOMING) {
            throw new ApiError(400, "Round is not available for booking");
        }
// Release any expired reservations for this round first, so a stale
// hold from an abandoned checkout can't block a genuine attempt.
await expireStaleBookingsForRound(round.id, txs);
        // Find all requested seats for this round
        const seatsBooked = await txs.seat.findMany({
            where: {
                publicId: { in: parsedSeats },
                roundId: round.id,
                status: SeatStatus.AVAILABLE
            },
            select: {
                id: true,
                publicId: true,
                poolId: true,
                roundId: true,
                name: true
            }
        });

        if (seatsBooked.length !== parsedSeats.length) {
            const bookedSeatIds = seatsBooked.map(seat => seat.publicId);
            const unavailableSeats = parsedSeats.filter((seatId: string) => !bookedSeatIds.includes(seatId));
            throw new ApiError(400, `The following seats are not available: ${unavailableSeats.join(", ")}`);
        }

        // Verify all seats belong to the same round
        const allSameRound = seatsBooked.every(seat => seat.roundId === round.id);
        if (!allSameRound) {
            throw new ApiError(400, "All seats must belong to the same round");
        }

        // Calculate expected price based on priceSnapshot
        const expectedPrice = Number(round.priceSnapshot) * seatsBooked.length;
        const receivedAmount = parsedAmount;

        if (Math.abs(expectedPrice - receivedAmount) > 0.01) {
            throw new ApiError(400, `Amount mismatch. Expected: ${expectedPrice}, Received: ${receivedAmount}`);
        }

        // Create booking
        let newBooking: Booking = await txs.booking.create({
            data: {
                roundId: round.id,
                amount: receivedAmount,
                status: BookingStatus.PENDING,
                userId: userid,
                tokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
                seats: {
                    connect: seatsBooked.map(seat => ({ id: seat.id }))
                }
            }
        });

        // Create Razorpay order
        const order = await createorder(receivedAmount, `booking_${newBooking.id}`);

        // Update seats to RESERVED
        await txs.seat.updateMany({
            where: {
                id: { in: seatsBooked.map(seat => seat.id) }
            },
            data: {
                status: SeatStatus.RESERVED,
                bookingId: newBooking.id
            }
        });

        // Create booking seat records with snapshot data
        const bookingSeatsData = seatsBooked.map((seat) => ({
            bookingId: newBooking.id,
            seatId: seat.id,
            roundId: seat.roundId,
            poolId: seat.poolId,
            seatName: seat.name,
            priceAtBooking: round.priceSnapshot
        }));

        await txs.bookingSeat.createMany({
            data: bookingSeatsData
        });

        // Update booking with provider order ID
        newBooking = await txs.booking.update({
            where: { id: newBooking.id },
            data: { providerOrderId: order.id }
        });

        return {
            booking: newBooking,
            order,
            seats: seatsBooked.map(seat => seat.publicId)
        };
    });

    return res.status(201).json(
        new ApiResponse(201, createBookingResult, "Booking has been created successfully")
    );
});

const updateBookingStatus = async (bookingId: string, paymentStatus: string, tx: any = prisma) => {
    if (!bookingId || !paymentStatus) {
        throw new ApiError(400, "Booking id and payment status are required");
    }

    const finalStatus = paymentStatus === "COMPLETED" ? BookingStatus.COMPLETED : BookingStatus.FAILED;

    const booking = await tx.booking.update({
        where: { id: bookingId },
        data: { status: finalStatus }
    });

    return booking;
};

const validateAndUpdateBookingStatus = asyncHandler(async (req: any, res: any) => {
    const { razorpay_payment_id, razorpay_order_id } = req.body;

    const isPaymentValid = await verifyPayment(req, res);

    if (!isPaymentValid) {
        throw new ApiError(400, "Payment verification failed");
    }

    const booking = await prisma.booking.findFirst({
        where: { providerOrderId: razorpay_order_id, userId: req.user.id }
    });

    if (!booking) {
        throw new ApiError(404, "Booking not found for the given order id");
    }

    // Shared with the Razorpay webhook. Idempotent: if the webhook already
    // completed this booking, this returns ALREADY_COMPLETED without writing
    // a second transaction row or second set of ledger entries.
    const result = await runFinalizeBookingPayment({
        bookingId: booking.id,
        gatewayOrderId: razorpay_order_id,
        gatewayPaymentId: razorpay_payment_id
    });

    if (result.outcome === "NEEDS_REFUND") {
        // Signature was valid, so the money was taken, but the seats are gone.
        // The webhook performs the actual refund; tell the user honestly.
        throw new ApiError(
            409,
            "Your payment was received after the seat hold expired and the seats were taken. It will be refunded automatically."
        );
    }

    return res.status(200).json(
        new ApiResponse(200, BookingStatus.COMPLETED, "Payment verification completed and booking status updated")
    );
});

const handlePaymentFailure = asyncHandler(async (req: any, res: any) => {
    const { reason, code, razorpay_payment_id, razorpay_order_id } = req.body;

    const booking = await prisma.booking.findFirst({
        where: { providerOrderId: razorpay_order_id }
    });

    if (!booking) {
        throw new ApiError(404, "Booking not found for the given order id");
    }

    // A late client-side "failed/dismissed" report must never undo a booking the
    // webhook (or verifyPayment) already completed.
    if (booking.status !== BookingStatus.PENDING) {
        return res.status(200).json(
            new ApiResponse(200, booking.status, "Booking already finalized")
        );
    }

    await prisma.transaction.create({
        data: {
            bookingId: booking.id,
            paymentGateway: "RAZORPAY",
            gatewayOrderId: razorpay_order_id,
            gatewayPaymentId: razorpay_payment_id,
            transactionAttemptStatus: TransactionAttemptStatus.FAILED,
            amount: booking.amount,
            error: {
                code,
                reason
            }
        }
    });

    const paymentStatus = "FAILED";
    const updatedBooking = await updateBookingStatus(booking.id, paymentStatus);

    if (!updatedBooking) {
        throw new ApiError(500, "Failed to update booking status");
    }

    const updateSeats = await updateSeatStatus(updatedBooking.id, updatedBooking.status);

    if (!updateSeats) {
        throw new ApiError(500, "Failed to update seat status");
    }

    return res.status(200).json(
        new ApiResponse(200, updatedBooking.status, "Payment verification completed and booking status updated")
    );
});

const handlePaymentDismiss = asyncHandler(async (req: any, res: any) => {
    const { razorpay_order_id } = req.body;

    const booking = await prisma.booking.findFirst({
        where: { providerOrderId: razorpay_order_id }
    });

    if (!booking) {
        throw new ApiError(404, "Booking not found for the given order id");
    }

    // A late client-side "failed/dismissed" report must never undo a booking the
    // webhook (or verifyPayment) already completed.
    if (booking.status !== BookingStatus.PENDING) {
        return res.status(200).json(
            new ApiResponse(200, booking.status, "Booking already finalized")
        );
    }

    await prisma.transaction.create({
        data: {
            bookingId: booking.id,
            paymentGateway: "RAZORPAY",
            gatewayOrderId: razorpay_order_id,
            gatewayPaymentId: "null",
            transactionAttemptStatus: TransactionAttemptStatus.FAILED,
            amount: booking.amount
        }
    });

    const paymentStatus = "FAILED";
    const updatedBooking = await updateBookingStatus(booking.id, paymentStatus);

    if (!updatedBooking) {
        throw new ApiError(500, "Failed to update booking status");
    }

    const updateSeats = await updateSeatStatus(updatedBooking.id, updatedBooking.status);

    if (!updateSeats) {
        throw new ApiError(500, "Failed to update seat status");
    }

    return res.status(200).json(
        new ApiResponse(200, updatedBooking.status, "Payment verification completed and booking status updated")
    );
});

// Public "check your ticket" lookup — no auth required, same as scanning a
// physical lottery ticket. Keyed by the booking's own id (an unguessable
// cuid), never by phone/name, so this can't be used to browse other users'
// purchases or winnings.
const lookupTicket = asyncHandler(async (req: any, res: any) => {
    const { ticketId } = req.params;

    if (!ticketId) {
        throw new ApiError(400, "ticketId is required");
    }

    const booking = await prisma.booking.findUnique({
        where: { id: ticketId },
        select: {
            id: true,
            status: true,
            amount: true,
            createdAt: true,
            round: {
                select: {
                    publicId: true,
                    roundNumber: true,
                    status: true,
                    drawnAt: true,
                    pool: { select: { publicId: true, name: true } }
                }
            },
            bookedSeats: {
                select: {
                    seatName: true,
                    seatId: true
                }
            }
        }
    });

    if (!booking) {
        throw new ApiError(404, "No ticket found with that ID. Double-check the ticket ID and try again.");
    }

    const seatIds = booking.bookedSeats.map(s => s.seatId);
    const winners = seatIds.length
        ? await prisma.winner.findMany({
            where: { seatId: { in: seatIds } },
            select: { seatId: true, position: true, prize: true, paid: true }
        })
        : [];

    const winnersBySeat = new Map(winners.map(w => [w.seatId, w]));

    const result = {
        ticketId: booking.id,
        status: booking.status,
        amount: booking.amount,
        purchasedAt: booking.createdAt,
        pool: booking.round.pool,
        round: {
            publicId: booking.round.publicId,
            roundNumber: booking.round.roundNumber,
            status: booking.round.status,
            drawnAt: booking.round.drawnAt
        },
        seats: booking.bookedSeats.map(s => {
            const win = winnersBySeat.get(s.seatId);
            return {
                name: s.seatName,
                isWinner: !!win,
                position: win?.position ?? null,
                prize: win?.prize ?? null,
                paid: win?.paid ?? null
            };
        })
    };

    return res
        .status(200)
        .json(new ApiResponse(200, result, "Ticket found"));
});

export { 
    createBooking, 
    validateAndUpdateBookingStatus, 
    handlePaymentFailure, 
    handlePaymentDismiss,
    lookupTicket
};