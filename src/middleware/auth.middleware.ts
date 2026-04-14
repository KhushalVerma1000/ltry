import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyAccessToken } from "../utils/tokenHelper.js";
import { prisma } from "../db/index.js";



// Middleware for regular users
export const verifyUserJWT = asyncHandler(async (req: any, res: any, next: any) => {
    try {
        const token =req.cookies.accessToken || req.headers.authorization?.replace("Bearer ", "");

        if (!token) {
            throw new ApiError(401, "Unauthorized request");
        }

        const decodedToken: any = verifyAccessToken(token);

        // Check if token is for a user (not admin)
        if (decodedToken.type !== 'user') {
            throw new ApiError(403, "Invalid token type");
        }

        const user = await prisma.user.findUnique({
            where: { id: decodedToken.id },
            select: {
                id: true,
                publicId: true,
                name: true,
                phone: true,
                createdAt: true,
                updatedAt: true
            }
        });

        if (!user) {
            throw new ApiError(401, "Invalid access token");
        }
       
        req.user = user;
        
        next();
    } catch (error: any) {
        throw new ApiError(401, error?.message || "Invalid access token");
    }
});

// Middleware for admin users
export const verifyAdminJWT = asyncHandler(async (req: any, res: any, next: any) => {
    try {
        const token = req.cookies.accessToken || req.headers.authorization?.replace("Bearer ", "");

        if (!token) {
            throw new ApiError(401, "Unauthorized request");
        }

        const decodedToken: any = verifyAccessToken(token);

        // Check if token is for an admin
        if (decodedToken.type !== 'admin') {
            throw new ApiError(403, "Admin access required");
        }

        const admin = await prisma.adminUser.findUnique({
            where: { id: decodedToken.id },
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
                updatedAt: true
            }
        });

        if (!admin) {
            throw new ApiError(401, "Invalid admin access token");
        }

        req.admin = admin;
        next();
    } catch (error: any) {
        throw new ApiError(401, error?.message || "Invalid access token");
    }
});




