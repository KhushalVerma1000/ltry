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
import { getWinnersForPool, markWinnerPaid } from "../controllers/winners.controller.js";

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

export default router;