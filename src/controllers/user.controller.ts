import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../db/index.js";
import { passwordHash, comparePassword } from "../utils/autherisationHelper.js";
import { generateUserTokens } from "../utils/tokenHelper.js";
import { createPaginationHelper } from "../utils/paginationHelper.js";


const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production"
}
const registerUser = asyncHandler(async (req: any, res: any) => {
    const { name, phone, password, bankAccountNumber, bankIFSCCode, upiId } = req.body;

    // Validate input
    if ([name, phone, password, bankAccountNumber, bankIFSCCode, upiId].some((field) => !field || field?.trim() === "")) {
        throw new ApiError(400, "All fields are required");
    }

    // Validate phone number
    if (!/^\d{10}$/.test(phone)) {
        throw new ApiError(400, "Invalid phone number format");
    }

    // Check if user already exists
    const existedUser = await prisma.user.findFirst({
        where: { phone: phone }
    });

    if (existedUser) {
        throw new ApiError(409, "User with this phone already exists");
    }

    // Hash password
    const hashedPassword = await passwordHash(password);

    // Create user
    const newUser = await prisma.user.create({
        data: {
            name: name.toLowerCase(),
            phone: phone,
            password: hashedPassword
            , bankAccountNumber, bankIFSCCode, upiId
        },
        select: {
            id: true,
            publicId: true,
            name: true,
            phone: true,
            createdAt: true,
            updatedAt: true,
            bankAccountNumber: true,
            bankIFSCCode: true,
            upiId: true
        }
    });

    // Generate tokens using helper
    const { accessToken, refreshToken } = generateUserTokens(newUser.id, newUser.phone);

    // Update user with refresh token
    await prisma.user.update({
        where: { id: newUser.id },
        data: { refreshToken: refreshToken }
    });

    // Send response
    return res.status(201)
        .cookie("refreshToken", refreshToken, cookieOptions)
        .cookie("accessToken", accessToken, cookieOptions)
        .json(
            new ApiResponse(
                201,
                {
                    user: {
                        ...newUser,
                        phone: newUser.phone.toString()
                    },
                    accessToken,
                    refreshToken
                },
                "User registered successfully"
            )
        );
});



const loginUser = asyncHandler(async (req: any, res: any) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        throw new ApiError(400, "Phone and password are required");
    }

    const user = await prisma.user.findFirst({
        where: { phone: phone }
    });

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials");
    }

    // Generate tokens using helper
    const { accessToken, refreshToken } = generateUserTokens(user.id, user.phone);

    // Update refresh token
    await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: refreshToken }
    });

    const { password: _, refreshToken: __, ...userWithoutSensitiveData } = user;




    return res.status(200).cookie("refreshToken", refreshToken, cookieOptions)
        .cookie("accessToken", accessToken, cookieOptions)
        .json(
            new ApiResponse(
                200,
                {
                    user: {
                        ...userWithoutSensitiveData,
                        phone: userWithoutSensitiveData.phone.toString()
                    },
                    accessToken,
                    refreshToken
                },
                "Login successful"
            )
        );
});

const logoutUser = asyncHandler(async (req: any, res: any) => {
    const userId = req.user?.id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    await prisma.user.update({
        where: { id: userId },
        data: { refreshToken: null }
    });

    return res.status(200)
        .clearCookie("refreshToken", cookieOptions)
        .clearCookie("accessToken", cookieOptions)
        .json(
            new ApiResponse(200, {}, "Logout successful")
        );
});

const refreshAccessToken = asyncHandler(async (req: any, res: any) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken || req.headers["x-refresh-token"];

    if (!incomingRefreshToken) {
        throw new ApiError(400, "Refresh token is required");
    }

    const user = await prisma.user.findFirst({
        where: { refreshToken: incomingRefreshToken }
    });

    if (!user) {
        throw new ApiError(401, "Invalid refresh token");
    }

    // Generate new tokens
    const tokens = generateUserTokens(user.id, user.phone);

    // Update refresh token
    await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: tokens.refreshToken }
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            tokens,
            "Token refreshed successfully"
        )
    );
});


const getcurrentUser = asyncHandler(async (req: any, res: any) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }
})



const getCurrentSeatsOfUser = asyncHandler(async (req: any, res: any) => {
    const userId = req.user?.id;

    if (!userId) { throw new ApiError(401, "Unauthorized"); }

    const paginationHelper = createPaginationHelper(req.query.page, req.query.limit);

    const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
            where: { userId: userId },
            skip: paginationHelper.skip,
            take: paginationHelper.take,
            include: {
                bookedSeats: {
                    select: {
                        seatName: true,
                        seat: {
                            select: {
                                publicId: true,
                                round: {
                                    select: {
                                        roundNumber: true,
                                        publicId: true,
                                        status: true,
                                        pool: {
                                            select: {
                                                name: true,
                                                publicId: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }),
        prisma.booking.count({
            where: { userId: userId }
        })
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            paginationHelper.format(bookings, total),
            "User's current bookings retrieved successfully"
        )
    );
})



const getUserWinnings = asyncHandler(async (req: any, res: any) => {
    const userId = req.user?.id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const winners = await prisma.winner.findMany({
        where: {
            seat: {
                booking: {
                    userId: userId
                }
            }
        },
        include: {
            seat: {
                select: {
                    name: true,
                    round: {
                        select: {
                            roundNumber: true,
                            pool: {
                                select: {
                                    name: true
                                }
                            }
                        }
                    }
                }
            }
        },
        orderBy: {
            createdAt: "desc"
        }
    });

    return res.status(200).json(
        new ApiResponse(200, winners, "User winnings retrieved successfully")
    );
});

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    getcurrentUser,
    getCurrentSeatsOfUser,
    getUserWinnings
};

