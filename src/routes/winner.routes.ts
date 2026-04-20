import { Router } from "express";
import { verifyAdminJWT } from "../middleware/auth.middleware.js";
import { 
    getWinnersForRound,
    getWinnersForPool,
    markWinnerPaid,
    createWinner 
} from "../controllers/winners.controller.js";

const router = Router();

// Get winners for a specific round
router.route("/:poolId/round/:roundId").get(getWinnersForRound);

// Get all winners for a pool
router.route("/:poolId").get(getWinnersForPool);

// Create a winner
router.route("/create").post(verifyAdminJWT, createWinner);

// Mark winner as paid
router.route("/:winnerId/paid").patch(verifyAdminJWT, markWinnerPaid);

export default router;