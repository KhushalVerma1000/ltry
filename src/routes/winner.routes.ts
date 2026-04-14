import { Router } from "express";

import { verifyAdminJWT } from "../middleware/auth.middleware.js";
import { markWinnerPaid } from "../controllers/winners.controller.js";

const router = Router();

// Public routes

// Protected routes
router.route("/winner-paid").patch(verifyAdminJWT, markWinnerPaid);


export default router;