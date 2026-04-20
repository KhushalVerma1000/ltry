import { BookingStatus, SeatStatus, TransactionAttemptStatus, RoundStatus, type Booking } from "../db/generated/prisma/client.js";
import { prisma } from "../db/index.js";
import { createorder, verifyPayment } from "../services/paymentcollection/Razerpay.service.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { arrayParserStringToArray } from "../utils/converterHelper.js";
import { updateSeatStatus, verifySeatStatus } from "./seats.controllers.js";

const createBooking = asyncHandler(async (req: any, res: any) => {
    const userid = req.user.id;
    const { roundId, amount, seats } = req.body;

    if (!roundId || !amount || !seats) {
        throw new ApiError(400, "roundId, amount, and seats are required");
    }

    if (isNaN(amount) || amount <= 0) {
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
        const receivedAmount = Number(amount);

        if (expectedPrice !== receivedAmount) {
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
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    const isPaymentValid = await verifyPayment(req, res);

    if (!isPaymentValid) {
        throw new ApiError(400, "Payment verification failed");
    }

    const result = await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findFirst({
            where: { providerOrderId: razorpay_order_id }
        });

        if (!booking) {
            throw new ApiError(404, "Booking not found for the given order id");
        }

        const paymentStatus = isPaymentValid ? "COMPLETED" : "FAILED";
        const transactionAttemptStatus = paymentStatus === "COMPLETED" 
            ? TransactionAttemptStatus.SUCCESS 
            : TransactionAttemptStatus.FAILED;

        await tx.transaction.create({
            data: {
                bookingId: booking.id,
                paymentGateway: "RAZORPAY",
                gatewayOrderId: razorpay_order_id,
                gatewayPaymentId: razorpay_payment_id,
                transactionAttemptStatus: transactionAttemptStatus,
                amount: booking.amount
            }
        });

        const updatedBooking = await updateBookingStatus(booking.id, paymentStatus, tx);

        if (!updatedBooking) {
            throw new ApiError(500, "Failed to update booking status");
        }

        const updateSeats = await updateSeatStatus(updatedBooking.id, updatedBooking.status, tx);

        if (!updateSeats) {
            throw new ApiError(500, "Failed to update seat status");
        }

        return updatedBooking;
    });

    return res.status(200).json(
        new ApiResponse(200, result.status, "Payment verification completed and booking status updated")
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

export { 
    createBooking, 
    validateAndUpdateBookingStatus, 
    handlePaymentFailure, 
    handlePaymentDismiss 
};