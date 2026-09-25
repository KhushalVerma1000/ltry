import { SeatStatus, RoundStatus, type Pool, type PoolRound } from "../db/generated/prisma/client.js";
import { prisma } from "../db/index.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createSeatsforRoundHelper } from "./seats.controllers.js";

const getAllPools = asyncHandler(async (req: any, res: any) => {
  const pools = await prisma.pool.findMany({
    select: {
      publicId: true,
      name: true,
      perSeatPrice: true,
   
      notes: true,
      rounds: {
        where: { status: { in: [RoundStatus.ACTIVE, RoundStatus.DRAWING, RoundStatus.UPCOMING] } },
        orderBy: { roundNumber: "desc" },
        take: 1,
        select: {
          roundNumber:true,
          publicId: true,
          status: true,
          startsAt: true,
          endsAt: true,
          drawnAt: true,
          _count: {
            select: {
              seats: {
                where: { status: SeatStatus.AVAILABLE }
              }
            }
          }
        }
      }
    }
  });



  const formattedPools = pools.map((pool) => ({
    publicId: pool.publicId,
    name: pool.name,
    perSeatPrice: pool.perSeatPrice,
   
    notes: pool.notes,
    activeRound: pool.rounds[0] ? {
      roundNumber: pool.rounds[0].roundNumber,
      publicId: pool.rounds[0].publicId,
      status: pool.rounds[0].status,
      startsAt: pool.rounds[0].startsAt,
      endsAt: pool.rounds[0].endsAt,
      drawnAt: pool.rounds[0].drawnAt,
      availableSeats: pool.rounds[0]._count.seats
    } : null
  }));

  return res
    .status(200)
    .json(new ApiResponse(200, formattedPools, "Pools fetched successfully"));
});


const getPoolsForGames = asyncHandler(async (req: any, res: any) => {
  let pools = await prisma.pool.findMany({
    select: {
      publicId: true,
      name: true,
      perSeatPrice: true,
      totalSeats: true,
      notes: true
    }
  });
  const poolData = pools.map((pool) => ({
    publicId: pool.publicId,
    name: pool.name,
    winningAmount: Number(pool.perSeatPrice ) * pool.totalSeats * 0.11,
    perSeatPrice: pool.perSeatPrice,
    totalSeats: pool.totalSeats,
    notes: pool.notes
  }));

  return res
    .status(200)
    .json(new ApiResponse(200, poolData, "Pools fetched successfully"));
});

const getPoolById = asyncHandler(async (req: any, res: any) => {
  const poolId = req.params.publicId;
  const pool = await prisma.pool.findUnique({
    where: { publicId: poolId },
    select: {
      publicId: true,
      name: true,
      perSeatPrice: true,
      totalSeats: true,
      notes: true,
      rounds: {
        where: { status: { in: [RoundStatus.ACTIVE, RoundStatus.DRAWING, RoundStatus.UPCOMING, RoundStatus.CLOSED] } },
        orderBy: { roundNumber: "desc" },
        take: 5,
        select: {
          publicId: true,
          roundNumber: true,
          status: true,
          startsAt: true,
          endsAt: true,
          drawnAt: true
        }
      }
    }
  });

  if (!pool) {
    throw new ApiError(404, "Pool not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, pool, "Pool fetched successfully"));
});

const getAdminPoolRounds = asyncHandler(async (req: any, res: any) => {
  const poolId = req.params.publicId;
  const { startDate, endDate } = req.query;

  const pool = await prisma.pool.findUnique({
    where: { publicId: poolId },
    select: { id: true }
  });
 
  if (!pool) {
    throw new ApiError(404, "Pool not found");
  }

  const whereClause: any = { poolId: pool.id };

  if (startDate || endDate) {
    whereClause.endsAt = {};
    if (startDate) {
      whereClause.endsAt.gte = new Date(startDate);
    }
    if (endDate) {
      whereClause.endsAt.lte = new Date(endDate);
    }
  }

  const rounds = await prisma.poolRound.findMany({
    where: whereClause,
    orderBy: { roundNumber: "desc" },
    select: {
      publicId: true,
      roundNumber: true,
      status: true,
      startsAt: true,
      endsAt: true,
      priceSnapshot: true,
      seatsSnapshot: true,
      drawnAt: true,
      _count: {
        select: {
          seats: {
            where: { status: SeatStatus.AVAILABLE }
          },
          bookings: true,
          winners: true
        }
      }
    }
  });

  return res
    .status(200)
    .json(new ApiResponse(200, rounds, "Rounds fetched successfully"));
});

const getPublicPoolRounds = asyncHandler(async (req: any, res: any) => {
  const poolId = req.params.publicId;

  const pool = await prisma.pool.findUnique({
    where: { publicId: poolId },
    select: { id: true }
  });

  if (!pool) {
    throw new ApiError(404, "Pool not found");
  }

  const rounds = await prisma.poolRound.findMany({
    where: { 
      poolId: pool.id,
      status: {
        in: [RoundStatus.ACTIVE, RoundStatus.DRAWING, RoundStatus.UPCOMING]
      }

    },
    orderBy: { roundNumber: "desc" },
    select: {
      publicId: true,
      roundNumber: true,
      status: true,
      startsAt: true,
      endsAt: true,
      priceSnapshot: true,
      seatsSnapshot: true,
      drawnAt: true,
      _count: {
        select: {
          seats: {
            where: { status: SeatStatus.AVAILABLE }
          },
          bookings: true,
          winners: true
        }
      }
    }
  });

  return res
    .status(200)
    .json(new ApiResponse(200, rounds, "Rounds fetched successfully"));
});

const createPool = asyncHandler(async (req: any, res: any) => {
  const { name, perSeatPrice, totalSeats, notes } = req.body;
  
  if (!name || !perSeatPrice || !totalSeats) {
    throw new ApiError(400, "Name, perSeatPrice and totalSeats are required");
  }

  const newPool = await prisma.pool.create({
    data: {
      name: name.toLowerCase(),
      perSeatPrice: parseFloat(perSeatPrice),
      totalSeats: parseInt(totalSeats),
      notes: notes || null
    },
    select: {
      publicId: true,
      name: true,
      perSeatPrice: true,
      totalSeats: true,
      notes: true,
      createdAt: true
    }
  });

  return res
    .status(201)
    .json(new ApiResponse(201, newPool, "Pool created successfully"));
});

const createPoolRound = asyncHandler(async (req: any, res: any) => {
  const poolId = req.params.publicId;
  const { roundNumber, startsAt, endsAt } = req.body;

  if (!roundNumber || !startsAt || !endsAt) {
    throw new ApiError(400, "roundNumber, startsAt, and endsAt are required");
  }

  const pool = await prisma.pool.findUnique({
    where: { publicId: poolId },
    select: { id: true, perSeatPrice: true, totalSeats: true }
  });

  if (!pool) {
    throw new ApiError(404, "Pool not found");
  }

  const newRound = await prisma.$transaction(async (tx) => {
    // Check if round number already exists for this pool
    const existingRound = await tx.poolRound.findUnique({
      where: {
        poolId_roundNumber: {
          poolId: pool.id,
          roundNumber: parseInt(roundNumber)
        }
      }
    });

    if (existingRound) {
      throw new ApiError(400, "Round number already exists for this pool");
    }
    console.log("round does not exist ................ creating new")

    // Create new round
    const round = await tx.poolRound.create({
      data: {
        poolId: pool.id,
        roundNumber: parseInt(roundNumber),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        status: RoundStatus.UPCOMING,
        priceSnapshot: pool.perSeatPrice,
        seatsSnapshot: pool.totalSeats
      },
      select: {
        id:true,
        publicId: true,
        roundNumber: true,
        status: true,
        startsAt: true,
        endsAt: true,
        priceSnapshot: true,
        seatsSnapshot: true
      }
    });

    if (!round) {
      throw new ApiError(500, "Failed to create pool round",round);
    }
    // Create seats for the new round
    const seats = await createSeatsforRoundHelper(
      round.publicId,
      pool.id,
      round.id,
      pool.totalSeats,
      tx
    );

    if (!seats) {
      throw new ApiError(500, "Failed to create seats for the round");
    }

    return { round, seats };
  });

  return res
    .status(201)
    .json(new ApiResponse(201, newRound, "Pool round created successfully"));
});

const updatePool = asyncHandler(async (req: any, res: any) => {
  const poolId = req.params.publicId;
  const { name, perSeatPrice, totalSeats, notes } = req.body;

  const updateData: Record<string, any> = {};

  if (name !== undefined) updateData.name = name.toLowerCase();
  if (perSeatPrice !== undefined) updateData.perSeatPrice = parseFloat(perSeatPrice);
  if (totalSeats !== undefined) updateData.totalSeats = parseInt(totalSeats);
  if (notes !== undefined) updateData.notes = notes;

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json(new ApiResponse(400, null, "No fields to update"));
  }

  const pool = await prisma.pool.update({
    where: { publicId: poolId },
    data: updateData,
    select: {
      publicId: true,
      name: true,
      perSeatPrice: true,
      totalSeats: true,
      notes: true,
      updatedAt: true
    }
  });

  if (!pool) {
    throw new ApiError(404, "Pool not found");
  }

  return res.status(200).json(new ApiResponse(200, pool, "Pool updated successfully"));
});

const updateRoundStatus = asyncHandler(async (req: any, res: any) => {
  const { poolId, roundId } = req.params;
  const { status, drawnAt } = req.body;

  if (!status || !Object.values(RoundStatus).includes(status)) {
    throw new ApiError(400, "Valid status is required (UPCOMING, ACTIVE, DRAWING, CLOSED, CANCELLED)");
  }

  if (status === RoundStatus.DRAWING && !drawnAt) {
    throw new ApiError(400, "drawnAt time is required when status is DRAWING");
  }

  const pool = await prisma.pool.findUnique({
    where: { publicId: poolId },
    select: { id: true }
  });

  if (!pool) {
    throw new ApiError(404, "Pool not found");
  }

  const updateData: any = { status };
  if (drawnAt) {
    updateData.drawnAt = new Date(drawnAt).toISOString();
  }

  const round = await prisma.poolRound.update({
    where: { publicId: roundId },
    data: updateData,
    select: {
      publicId: true,
      roundNumber: true,
      status: true,
      startsAt: true,
      endsAt: true,
      drawnAt: true
    }
  });

  return res.status(200).json(new ApiResponse(200, round, "Round status updated successfully"));
});

const deletePool = asyncHandler(async (req: any, res: any) => {
  const poolId = req.params.publicId;
  
  const deletedPool = await prisma.pool.delete({
    where: { publicId: poolId },
    select: {
      publicId: true,
      name: true
    }
  });

  if (!deletedPool) {
    throw new ApiError(404, "Pool not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, deletedPool, "Pool deleted successfully"));
});

const resetRound = asyncHandler(async (req: any, res: any) => {
  const { poolId, roundId } = req.params;

  const pool = await prisma.pool.findUnique({
    where: { publicId: poolId },
    select: { id: true }
  });

  if (!pool) {
    throw new ApiError(404, "Pool not found");
  }

  const round = await prisma.poolRound.findUnique({
    where: { publicId: roundId },
    select: { id: true }
  });

  if (!round) {
    throw new ApiError(404, "Round not found");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedSeats = await tx.seat.updateMany({
      where: { roundId: round.id },
      data: {
        bookingId: null,
        status: SeatStatus.AVAILABLE
      }
    });

    return updatedSeats;
  });

  return res.status(200).json(new ApiResponse(200, result, "Round bookings cleared successfully"));
});

export {
  getAllPools,
  getPoolById,
  getAdminPoolRounds,
  getPublicPoolRounds,
  createPool,
  createPoolRound,
  updatePool,
  updateRoundStatus,
  resetRound,
  deletePool
};
