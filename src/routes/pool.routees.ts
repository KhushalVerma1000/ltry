import { Router } from "express";
import { verifyAdminJWT } from "../middleware/auth.middleware.js";
import { 
    createPool,
    getPoolById,
    getAllPools,
    deletePool,
    updatePool,
    getPoolRounds,
    createPoolRound,
    updateRoundStatus,
    resetRound
} from "../controllers/pool.controllers.js";

const router = Router();

// Pool routes
router.route("/create").post(verifyAdminJWT, createPool);
router.route("/update/:publicId").put(verifyAdminJWT, updatePool);
router.route("/delete/:publicId").delete(verifyAdminJWT, deletePool);
router.route("/p/:publicId").get(getPoolById);
router.route("/:publicId/rounds").get(getPoolRounds);
router.route("/:publicId/round/create").post(verifyAdminJWT, createPoolRound);
router.route("/:poolId/round/:roundId/status").put(verifyAdminJWT, updateRoundStatus);
router.route("/:poolId/round/:roundId/reset").put(verifyAdminJWT, resetRound);
router.route("/").get(getAllPools);

export default router;