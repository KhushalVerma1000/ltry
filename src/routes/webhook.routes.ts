import { Router } from "express";
import { razorpayWebhook } from "../controllers/webhook.controllers.js";

const router = Router();

// No auth middleware: Razorpay calls this, authenticity is the HMAC signature.
router.route("/razorpay").post(razorpayWebhook);

export default router;
