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
    const { name, email, password ,key} = req.body;
    
    // Validate input
    if ([name, email, password,key].some((field) => !field || field?.trim() === "")) {
        throw new ApiError(400, "All fields are required");
    }

    if(key!==process.env.ADMIN_KEY){
        throw new ApiError(400, "Invalid key");
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
    const { poolId, roundId, numberOfWinners } = req.body;

    if (!poolId || !roundId || !numberOfWinners) {
        throw new ApiError(400, "poolId, roundId, and numberOfWinners are required");
    }

    if (numberOfWinners <= 0) {
        throw new ApiError(400, "Number of winners must be greater than 0");
    }

    const pool = await prisma.pool.findUnique({
        where: { publicId: poolId },
        select: { id: true }
    });

    if (!pool) {
        throw new ApiError(404, "Pool not found");
    }

    const round = await prisma.poolRound.findUnique({
        where: { publicId: roundId },
        select: { id: true, roundNumber: true }
    });

    if (!round) {
        throw new ApiError(404, "Round not found");
    }

    // Get all booked seats (SOLD status) in this round
    const seats = await prisma.seat.findMany({
        where: {
            roundId: round.id,
            status: "SOLD"
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
    const winnerSeatsWithPosition = winnerSeats.map((seat: any, index: number) => ({
        ...seat,
        position: index + 1
    }));

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                poolId,
                roundId,
                roundNumber: round.roundNumber,
                numberOfWinners,
                winnerSeatsWithPosition,
                totalAvailableSeats: seats.length
            },
            `Successfully selected ${numberOfWinners} random winner seats`
        )
    );
});




const setWinnerSeats = asyncHandler(async (req: any, res: any) => {
    let { poolId, roundId, winnerSeats } = req.body;

    if (!poolId || !roundId || !winnerSeats) {
        throw new ApiError(400, "poolId, roundId, and winnerSeats are required");
    }

    const pool = await prisma.pool.findUnique({
        where: { publicId: poolId },
        select: { id: true }
    });

    if (!pool) {
        throw new ApiError(404, "Pool not found");
    }

    const round = await prisma.poolRound.findUnique({
        where: { publicId: roundId },
        select: { id: true, priceSnapshot: true }
    });

    if (!round) {
        throw new ApiError(404, "Round not found");
    }

    // Validate winnerSeats is an array
    winnerSeats = arrayParserStringToArray(winnerSeats);

    // Verify all seats exist in this round
    const seatsValidForRound = await prisma.seat.findMany({
        where: {
            roundId: round.id,
            id: {
                in: winnerSeats.map((seat: any) => seat.id)
            }
        },
        select: { id: true }
    });

    if (seatsValidForRound.length !== winnerSeats.length) {
        throw new ApiError(400, "Some winner seats are not valid for the specified round");
    }

    // Validate each winner seat structure
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

    // Prepare winner data with roundId and poolId
    const winnerData = winnerSeats.map((seat: winnerSeats) => ({
        seatId: seat.id,
        roundId: round.id,
        poolId: pool.id,
        position: seat.position,
        prize: getPrizeForPosition(seat.position, round.priceSnapshot)
    }));

    const winners = await prisma.winner.createMany({
        data: winnerData
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            winners,
            "Winner seats set successfully"
        )
    );
});

// Helper function to calculate prize based on position
const getPrizeForPosition = (position: number, basePrice: any): number => {
    const multipliers: Record<number, number> = {
        1: 10,  // 1st place: 10x
        2: 5,   // 2nd place: 5x
        3: 3,   // 3rd place: 3x
        4: 1.5, // 4th place: 1.5x
    };
    
    const multiplier = multipliers[position] || 1;
    return Number((Number(basePrice) * multiplier).toFixed(2));
};



// const resetPool = asyncHandler(async (req: any, res: any) => {
//     const { poolId } = req.body;

//     if (!poolId) {
//         throw new ApiError(400, "Pool ID is required");
//     }

//     const pool = await prisma.pool.findUnique({
//         where: { id: poolId },
//         select: { id: true }
//     });

//     if (!pool) {
//         throw new ApiError(404, "Pool not found");
//     }

//     // Reset seats: clear bookingId and set status back to AVAILABLE
//     // BookingSeat log records are intentionally NOT touched — they are a permanent audit log
//     const resetData = await prisma.seat.updateMany({
//         where: { poolId: pool.id },
//         data: {
//             bookingId: null,
//             status: "AVAILABLE",
//         }
//     });

//     return res.status(200).json(
//         new ApiResponse(200, { count: resetData.count }, `Reset ${resetData.count} seats to AVAILABLE. Booking logs preserved.`)
//     );
// })


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
    
};