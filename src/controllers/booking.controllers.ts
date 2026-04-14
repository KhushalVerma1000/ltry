import { bookingStatus, seatStatus, type Booking } from "../db/generated/prisma/client.js";
import { prisma } from "../db/index.js";
import { createorder, verifyPayment } from "../services/paymentcollection/Razerpay.service.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { arrayParserStringToArray } from "../utils/converterHelper.js";
import { updateSeatStatus, verifySeatStatus } from "./seats.controllers.js";



const createBooking = asyncHandler(async (req: any, res: any) => {
    const userid = req.user.id;
    const { amount, seats } = req.body;

    if (!amount || !seats) {
        throw new ApiError(400, "Amount and seats are required")
    }

    if (isNaN(amount) || amount <= 0) {
        throw new ApiError(400, "Invalid amount value");
    }



    const parsedSeats = arrayParserStringToArray(seats);





    // const newPayment: Booking = await prisma.booking.create({
    //     data:{
    //         amount:amount,
    //         status:bookingStatus.PENDING,
    //         userId:userid,
    //         seats: {
    //             connect: seats.map((seatId: number) => ({ id: seatId }))
    //         }
    //     }
    // })

    const createBooking = await prisma.$transaction(async (txs) => {
        const seatsBooked = await txs.seat.findMany({
            where: {
                publicId: { in: parsedSeats },
                status: seatStatus.AVAILABLE
            }, select: {
                id: true,
                publicId: true,
                poolId: true,
                name: true
            }
        })

        if (seatsBooked.length !== parsedSeats.length) {
            const bookedSeatIds = seatsBooked.map(seat => seat.publicId);
            const unavailableSeats = parsedSeats.filter((seatId: string) => !bookedSeatIds.includes(seatId));
            throw new ApiError(400, `The following seats are not available: ${unavailableSeats.join(", ")}`);
        }
        console.log(seatsBooked)
        // double check mount
        // Group booked seats by poolId
        const seatsByPool = seatsBooked.reduce((acc, seat) => {
            acc[seat.poolId] = (acc[seat.poolId] || 0) + 1
            return acc
        }, {} as Record<number, number>)

        // Fetch perSeatPrice for each pool involved
        const pools = await txs.pool.findMany({
            where: { id: { in: Object.keys(seatsByPool).map(Number) } },
            select: { id: true, perSeatPrice: true }
        })

        // Calculate expected price: sum of (perSeatPrice * seatCount) per pool
        const expectedPrice = pools.reduce((total, pool) => {
            const seatCount = seatsByPool[pool.id] || 0
            return total + Number(pool.perSeatPrice) * seatCount
        }, 0)

        const receivedAmount = Number(amount)
        if (expectedPrice !== receivedAmount) {
            throw new ApiError(400, `Amount mismatch. Expected: ${expectedPrice}, Received: ${receivedAmount}`)
        }

        let newBooking: Booking = await txs.booking.create({
            data: {
                amount: amount,
                status: bookingStatus.PENDING,
                userId: userid,
                seats: {
                    connect: seatsBooked.map(seat => ({ id: seat.id }))
                }
            }
        })

        const order = await createorder(amount, `booking_${newBooking.id}`)



        const updatedSeats = await txs.seat.updateManyAndReturn({
            where: {
                id: { in: seatsBooked.map(seat => seat.id) }
            },
            data: {
                status: seatStatus.RESERVED
            }
        })
        const bookingSeatsData = seatsBooked.map((seat) => ({


            bookingId: newBooking.id,
            seatId: seat.id,
            seatName: seat.name,  // snapshot
            poolId: seat.poolId,      // snapshot
        }));


        const bookingSeats = await txs.bookingSeat.createMany({
            data: bookingSeatsData,
        });

        newBooking = await txs.booking.update({
            where: {
                id: newBooking.id
            },
            data: {
                providerPaymentId: order.id
            }
        })


        const booking = {
            ...newBooking,
            order,
            seats: seatsBooked.map(seat => seat.publicId)
        }
        console.log(booking)
        return booking

    }
    )

    return res.status(201).json(new ApiResponse(201, createBooking, "Booking has been created successfully"))
}
)


const updateBookingStatus = async (bookingId: string, paymentstatus: string) => {
    if (!bookingId || !paymentstatus) {
        throw new ApiError(400, "Booking id and payment status are required")
    }

    // Determine the correct Prisma bookingStatus enum value
    const finalStatus = paymentstatus === "COMPLETED" ? bookingStatus.COMPLETED : bookingStatus.FAILED;

    const booking = await prisma.booking.update({
        where: {
            id: bookingId
        },
        data: {
            status: finalStatus
        }
    })
    return booking
}

const validateAndUpdateBookingStatus = asyncHandler(async (req: any, res: any) => {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body

    const ispaymentValid = await verifyPayment(req, res)

    const booking = await prisma.booking.findFirst({ where: { providerPaymentId: razorpay_order_id } })

    if (!booking) {
        throw new ApiError(404, "Booking not found for the given order id")
    }

    const paymentstatus = ispaymentValid ? "COMPLETED" : "FAILED"

    const updatedBooking = await updateBookingStatus(booking.id, paymentstatus)

    if (!updatedBooking) {
        throw new ApiError(500, "Failed to update booking status")
    }

    const updateSeats = await updateSeatStatus(updatedBooking.id,updatedBooking.status)

    if (!updateSeats) {
        throw new ApiError(500, "Failed to update seat status")
    }

    console.log(updateBookingStatus,updateSeats)
    return res.status(200).json(new ApiResponse(200,updatedBooking.status, "Payment verification completed and booking status updated"))
})

 const handlePaymentFaliure = asyncHandler(async (req: any, res: any) => {
    const { reason,code,razorpay_payment_id, razorpay_order_id } = req.body


    const booking = await prisma.booking.findFirst({ where: { providerPaymentId: razorpay_order_id } })

    if (!booking) {
        throw new ApiError(404, "Booking not found for the given order id")
    }

    const paymentstatus =  "FAILED"

    const updatedBooking = await updateBookingStatus(booking.id, paymentstatus)

    if (!updatedBooking) {
        throw new ApiError(500, "Failed to update booking status")
    }

    const updateSeats = await updateSeatStatus(updatedBooking.id,updatedBooking.status)

    if (!updateSeats) {
        throw new ApiError(500, "Failed to update seat status")
    }

    console.log(updateBookingStatus,updateSeats)
    return res.status(200).json(new ApiResponse(200,updatedBooking.status, "Payment verification completed and booking status updated"))
})

export { createBooking, validateAndUpdateBookingStatus }