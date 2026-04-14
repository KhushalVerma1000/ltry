import { Router } from "express";
import { 
    registerUser, 
    loginUser, 
    logoutUser, 
    refreshAccessToken ,getCurrentSeatsOfUser
} from "../controllers/user.controller.js";
import { verifyUserJWT } from "../middleware/auth.middleware.js";

const router = Router();

// Public routes
router.route("/register").post(registerUser);
router.route("/login").post(loginUser);
router.route("/refresh-token").post(refreshAccessToken);

// Protected routes
router.route("/logout").post(verifyUserJWT, logoutUser);
router.route("/current-bookings").get(verifyUserJWT, getCurrentSeatsOfUser);

export default router;