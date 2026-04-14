import { Router } from "express";
import { verifyAdminJWT } from "../middleware/auth.middleware.js";
import { createPool,getPoolById,getAllPools,deletePool, getPoolWithDetailsById } from "../controllers/pool.controllers.js";


const router = Router();
router.route("/create").post(verifyAdminJWT, createPool);
router.route("/p/:publicId").get(getPoolById);
router.route("/delete/:publicId").delete(verifyAdminJWT, deletePool);
router.route("/details/:publicId").get(getPoolWithDetailsById);
router.route("/").get(getAllPools);
export default router