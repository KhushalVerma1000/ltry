import { Router } from "express";

import { verifyUserJWT } from "../middleware/auth.middleware.js";
import { createBooking,validateAndUpdateBookingStatus } from "../controllers/booking.controllers.js";

const router = Router();

// Public routes
router.route("/bookSeats").post(verifyUserJWT, createBooking);
router.route("/verifyPayment").post(verifyUserJWT, validateAndUpdateBookingStatus);
export default router;