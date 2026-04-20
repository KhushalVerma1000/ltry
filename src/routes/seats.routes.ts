import { Router } from "express";
import { verifyAdminJWT } from "../middleware/auth.middleware.js";
import { 
    getRoundSeats,
    getSeatDetailsByIDForAdmin,
    createSeatsforRound
} from "../controllers/seats.controllers.js";

const router = Router();

router.route("/round/:roundId").get(getRoundSeats);
router.route("/round/:roundId/create").post(verifyAdminJWT, createSeatsforRound);
router.route("/detail/:seatid").get(verifyAdminJWT, getSeatDetailsByIDForAdmin);

export default router;