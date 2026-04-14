import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../db/index.js";
import { passwordHash, comparePassword } from "../utils/autherisationHelper.js";
import { generateAdminTokens, verifyRefreshToken } from "../utils/tokenHelper.js";
import { arrayParserStringToArray } from "../utils/converterHelper.js";
import { getPrizeArray } from "../utils/calculationHelper.js";



const cookieOptions={
    httpOnly: true,
    secure: true
}


type winnerSeats = {
    id: number;
    position: number;
};
const registerAdmin = asyncHandler(async (req: any, res: any) => {
    const { name, email, password } = req.body;
    
    // Validate input
    if ([name, email, password].some((field) => !field || field?.trim() === "")) {
        throw new ApiError(400, "All fields are required");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new ApiError(400, "Invalid email format");
    }

    // Check if admin already exists
    const existedAdmin = await prisma.adminUser.findUnique({
        where: { email: email.toLowerCase() }
    });
    
    if (existedAdmin) {
        throw new ApiError(409, "Admin with this email already exists");
    }

    // Hash password
    const hashedPassword = await passwordHash(password);

    // Generate tokens first (we'll need them for creation)
    const tempTokens = generateAdminTokens("temp", email);

    // Create admin
    const newAdmin = await prisma.adminUser.create({
        data: {
            name,
            email: email.toLowerCase(),
            password: hashedPassword,
            refreshToken: tempTokens.refreshToken // Initial refresh token
        },
        select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            updatedAt: true
        }
    });

    // Generate final tokens with actual admin ID
    const { accessToken, refreshToken } = generateAdminTokens(newAdmin.id, newAdmin.email);

    // Update with final refresh token
    await prisma.adminUser.update({
        where: { id: newAdmin.id },
        data: { refreshToken: refreshToken }
    });

    return res.status(201)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .cookie("accessToken", accessToken, cookieOptions)
    .json(
        new ApiResponse(
            201,
            {
                admin: newAdmin,
                accessToken,
                refreshToken
            },
            "Admin registered successfully"
        )
    );
});

const loginAdmin = asyncHandler(async (req: any, res: any) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required");
    }

    const admin = await prisma.adminUser.findUnique({
        where: { email: email.toLowerCase() }
    });

    if (!admin) {
        throw new ApiError(404, "Admin not found");
    }

    const isPasswordValid = await comparePassword(password, admin.password);
    
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials");
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateAdminTokens(admin.id, admin.email);

    // Update refresh token
    await prisma.adminUser.update({
        where: { id: admin.id },
        data: { refreshToken: refreshToken }
    });

    const { password: _, refreshToken: __, ...adminWithoutSensitiveData } = admin;

    return res.status(200)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .cookie("accessToken", accessToken, cookieOptions)
    .json(
        new ApiResponse(
            200,
            {
                admin: adminWithoutSensitiveData,
                accessToken,
                refreshToken
            },
            "Admin login successful"
        )
    );
});

const logoutAdmin = asyncHandler(async (req: any, res: any) => {
    const adminId = req.admin?.id;

    if (!adminId) {
        throw new ApiError(401, "Unauthorized");
    }

    await prisma.adminUser.update({
        where: { id: adminId },
        data: { refreshToken: "" }
    });

    return res.status(200)
    .clearCookie("refreshToken", cookieOptions)
    .clearCookie("accessToken", cookieOptions)
    .json(
        new ApiResponse(200, {}, "Admin logout successful")
    );
});

const refreshAdminAccessToken = asyncHandler(async (req: any, res: any) => {
   const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken || req.headers["x-refresh-token"];

    if (!incomingRefreshToken) {
        throw new ApiError(400, "Refresh token is required");
    }

  try {
      const decodedToken = verifyRefreshToken(incomingRefreshToken);
  
      if (!decodedToken || decodedToken.type !== "admin") {
          throw new ApiError(401, "Invalid refresh token");
      }
      if (typeof decodedToken.id !== "string") {
          throw new ApiError(401, "Invalid refresh token user id");
      }
    
      const admin = await prisma.adminUser.findUnique({
          where: { id: decodedToken.id }
      });
      if (!admin) {
          throw new ApiError(401, "Invalid refresh token");
      }
  
      if (incomingRefreshToken !== admin?.refreshToken) {
          throw new ApiError(401, "Refresh token is expired or used");
      }
  
      // Generate new tokens
    const tokens = generateAdminTokens(admin.id, admin.email);
      // Update refresh token
     
      const updatedAdmin = await prisma.adminUser.update({
          where: { id: admin.id },
          data: { refreshToken: tokens.refreshToken }
      });
  
      return res.status(200)
      .cookie("refreshToken", tokens.refreshToken, cookieOptions)
      .cookie("accessToken", tokens.accessToken, cookieOptions)
     .json(
          new ApiResponse(
              200,
              tokens,
              "Admin token refreshed successfully"
          )
      );
  } catch (error:any) {
    throw new ApiError(500,error?.message || "Invalid refresh token");
  }
});



const drawWinnerSeats = asyncHandler(async (req: any, res: any) => {
    const { poolId, numberOfWinners } = req.body;

    if (!poolId || !numberOfWinners) {
        throw new ApiError(400, "Pool ID and number of winners are required");
    }

    if (numberOfWinners <= 0) {
        throw new ApiError(400, "Number of winners must be greater than 0");
    }

    const pool = await prisma.pool.findUnique({
        where: { publicId: poolId }
    });

    if (!pool) {
        throw new ApiError(404, "Pool not found");
    }

    const seats = await prisma.seat.findMany({
        where: {
            poolId: pool.id
          
        },
        select: {
            id: true,
            name: true
        },
        orderBy: {
            updatedAt: "desc"
        }
    });

    // Validate that there are enough seats
    if (seats.length < numberOfWinners) {
        throw new ApiError(400, `Not enough booked seats. Available: ${seats.length}, Required: ${numberOfWinners}`);
    }

    // Function to randomly select items from array
    const getRandomSeats = (array: any[], count: number) => {
        const shuffled = [...array].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    };

    const winnerSeats = getRandomSeats(seats, numberOfWinners);
const winnerSeatsWithPostion =
winnerSeats.map((seat: any) => ({
    ...seat,
    position: winnerSeats.indexOf(seat) + 1
}))
    return res.status(200).json(
        new ApiResponse(
            200,
            {
                poolId,
                numberOfWinners,
                winnerSeatsWithPostion,
                totalAvailableSeats: seats.length
            },
            `Successfully selected ${numberOfWinners} random winner seats`
        )
    );
})




const setWinnerSeats = asyncHandler(async (req: any, res: any) => {
    let { poolId, winnerSeats } = req.body;

    if (!poolId|| !winnerSeats) {
        throw new ApiError(400, "Pool ID, winner seats, and date are required");
    }

    const Pool = await prisma.pool.findUnique({
        where: { publicId: poolId }
    });
    if (!Pool) {
        throw new ApiError(404, "Pool not found");
    }



    // Validate winnerSeats is an array
   winnerSeats = arrayParserStringToArray(winnerSeats)

    const SeatsValidForPool = await prisma.seat.findMany({
        where: {
            poolId: Pool.id,
            id: {
                in: winnerSeats.map((seat: any) => seat.id)
            }
        },select:{
            id:true
        }
    });

    if (SeatsValidForPool.length !== winnerSeats.length) {
        throw new ApiError(400, "Some winner seats are not valid for the specified pool");
    }

    // Validate each winner seat matches the type
    const isValidWinnerSeats = winnerSeats.every((seat: any) => {
        return (
            typeof seat === 'object' &&
            seat !== null &&
            typeof seat.id === 'number' &&
            typeof seat.position === 'number'
        );
    });

    if (!isValidWinnerSeats) {
        throw new ApiError(400, "Each seat must have id (number) and position (number)");
    }



    const winnerDataWithoutprize = winnerSeats.map((seat: winnerSeats) => ({
        
        seatId: seat.id,
        position: seat.position
    }));
    const winnerData = getPrizeArray(Pool,winnerDataWithoutprize)
   console.table(winnerData)
    const winner = await prisma.winner.createMany({
        data: winnerData
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            winner,
            "Winner seats set successfully"
        )
    );
});



const resetPool = asyncHandler(async (req: any, res: any) => {
    const { poolId } = req.body;

    if (!poolId) {
        throw new ApiError(400, "Pool ID is required");
    }

    const pool = await prisma.pool.findUnique({
        where: { id: poolId },
        select: { id: true }
    });

    if (!pool) {
        throw new ApiError(404, "Pool not found");
    }

    // Reset seats: clear bookingId and set status back to AVAILABLE
    // BookingSeat log records are intentionally NOT touched — they are a permanent audit log
    const resetData = await prisma.seat.updateMany({
        where: { poolId: pool.id },
        data: {
            bookingId: null,
            status: "AVAILABLE",
        }
    });

    return res.status(200).json(
        new ApiResponse(200, { count: resetData.count }, `Reset ${resetData.count} seats to AVAILABLE. Booking logs preserved.`)
    );
})


const getWinnerPayout = asyncHandler(async (req: any, res: any) => {
    const { poolId } = req.params;  

})

export { 
    registerAdmin, 
    loginAdmin, 
    logoutAdmin, 
    refreshAdminAccessToken,
    drawWinnerSeats,
    setWinnerSeats,
    resetPool
};