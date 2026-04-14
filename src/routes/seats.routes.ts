import { Router } from "express";
import { verifyAdminJWT } from "../middleware/auth.middleware.js";
import { getPoolSeats ,getSeatDetailsByIDForAdmin} from "../controllers/seats.controllers.js";


const router = Router();

router.route("/s/:poolid").get(getPoolSeats);
router.route("/sd/:seatid").get(verifyAdminJWT,getSeatDetailsByIDForAdmin);
export default router