import { Router } from "express";
import { verifyUserJWT } from "../middleware/auth.middleware.js";
import { 
    createBooking,
    validateAndUpdateBookingStatus,
    handlePaymentDismiss,
    handlePaymentFailure,
    lookupTicket
} from "../controllers/booking.controllers.js";

const router = Router();

// Public — "check your ticket" lookup, no login required
router.route("/lookup/:ticketId").get(lookupTicket);

// Booking routes
router.route("/bookSeats").post(verifyUserJWT, createBooking);
router.route("/verifyPayment").post(verifyUserJWT, validateAndUpdateBookingStatus);
router.route("/paymentDismiss").post(verifyUserJWT, handlePaymentDismiss);
router.route("/paymentFailure").post(verifyUserJWT, handlePaymentFailure);

export default router;