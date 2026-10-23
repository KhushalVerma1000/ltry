import { Router } from "express";
import { 
    registerAdmin, 
    loginAdmin, 
    logoutAdmin, 
    refreshAdminAccessToken,
    drawWinnerSeats,
    setWinnerSeats
} from "../controllers/admin.controller.js";
import { verifyAdminJWT } from "../middleware/auth.middleware.js";
import { getWinnersForPool, getWinnersForRoundAdmin, markWinnerPaid } from "../controllers/winners.controller.js";
import { listPayoutVerifications, setPayoutVerification } from "../controllers/payoutVerification.controller.js";

const router = Router();

// Public routes
router.route("/register").post(registerAdmin);
router.route("/login").post(loginAdmin);
router.route("/refresh-token").post(refreshAdminAccessToken);

// Protected routes
router.route("/logout").post(verifyAdminJWT, logoutAdmin);
router.route("/draw-winner-seats").post(verifyAdminJWT, drawWinnerSeats);
router.route("/set-winner-seats").post(verifyAdminJWT, setWinnerSeats);
router.get("/get-winners/:poolId", verifyAdminJWT, getWinnersForPool);
router.route("/winner-paid/:winnerId").patch(verifyAdminJWT, markWinnerPaid);

// Winners with payout details + verification status (admin only; the public
// /winners route no longer returns phone / bank / UPI details)
router.get("/winners/:poolId/round/:roundId", verifyAdminJWT, getWinnersForRoundAdmin);

// Manual payout verification
router.get("/payout-verifications", verifyAdminJWT, listPayoutVerifications);
router.patch("/users/:userId/payout-verification", verifyAdminJWT, setPayoutVerification);

export default router;