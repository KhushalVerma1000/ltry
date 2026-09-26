import { Router } from "express";
import { getMyLedger, getUserLedger, createManualAdjustment } from "../controllers/ledger.controller.js";
import { verifyUserJWT, verifyAdminJWT } from "../middleware/auth.middleware.js";

const router = Router();

// User: their own ledger + running balance
router.route("/me").get(verifyUserJWT, getMyLedger);

// Admin: any user's ledger, and manual adjustments
router.route("/user/:userId").get(verifyAdminJWT, getUserLedger);
router.route("/adjust").post(verifyAdminJWT, createManualAdjustment);

export default router;
