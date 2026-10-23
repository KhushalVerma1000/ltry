import { Router } from "express";
import { 
    registerUser, 
    loginUser, 
    refreshAccessToken,
    getCurrentSeatsOfUser,
    getcurrentUser,
    getUserWinnings,
    logoutUser
} from "../controllers/user.controller.js";
import { verifyUserJWT } from "../middleware/auth.middleware.js";

const router = Router();

// Public routes
router.route("/register").post(registerUser);
router.route("/login").post(loginUser);
router.route("/refresh-token").post(refreshAccessToken);

// Protected routes
router.route("/logout").post(verifyUserJWT, logoutUser);
router.route("/me").get(verifyUserJWT, getcurrentUser);
router.route("/current-bookings").get(verifyUserJWT, getCurrentSeatsOfUser);
router.route("/winnings").get(verifyUserJWT, getUserWinnings);

export default router;