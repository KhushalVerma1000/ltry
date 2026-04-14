import { seatStatus, type Pool } from "../db/generated/prisma/client.js";
import { prisma } from "../db/index.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createSeatsforPoolHelper } from "./seats.controllers.js";

// const getAllPools = asyncHandler(async (req: any, res: any) => {
//     const pools: Pool[] = await prisma.pool.findMany({
//         include:{
//           _count:{
//             select:{
//                 seats:{
//                     where:{
//                         status:seatStatus.AVAILABLE
//                     }
//                 }
//             }
//           }
//            }

//         }

//     )

//     return res.status(200).json(new ApiResponse(200, pools, "Pools fetched successfully"));
// })

const getAllPools = asyncHandler(async (req: any, res: any) => {
  const poolsD = await prisma.pool.findMany({
    select: {
      publicId: true,
      name: true,
      perSeatPrice: true,
      totalSeats: true,
      _count: {
        select: {
          seats: {
            where: {
              status: seatStatus.AVAILABLE,
            },
          },
        },
      },
    },
  });

  const pools = poolsD.map((pool) => ({
    publicId: pool.publicId,
    name: pool.name,
    perSeatPrice: pool.perSeatPrice,
    totalSeats: pool.totalSeats,
    availableSeats: pool._count.seats,
  }));
  return res
    .status(200)
    .json(new ApiResponse(200, pools, "Pools fetched successfully"));
});

const getPoolById = asyncHandler(async (req: any, res: any) => {
  const poolId = req.params.publicId;
  const pool: Pool | null = await req.prisma.pool.findUnique({
    where: { publicId: poolId },
  });

  if (!pool) {
    return new ApiError(404, "Pool not found");
  }
  return res
    .status(201)
    .json(new ApiResponse(200, pool, "Pool fetched successfully"));
});

const getPoolWithDetailsById = asyncHandler(async (req: any, res: any) => {
  const poolId = req.params.publicId;
  const pool = await prisma.pool.findUnique({
    where: { publicId: poolId },
    include: {
      seats: true,
    },
  });

  if (!pool) {
    throw new ApiError(404, "Pool not found");
  }
 
  
  return res
    .status(201)
    .json(new ApiResponse(200, pool, "Pool fetched with details successfully"));
});

const createPool = asyncHandler(async (req: any, res: any) => {
  const { name, perSeatPrice, totalSeats } = req.body;
  if (!name || !perSeatPrice || !totalSeats) {
    throw new ApiError(400, "Name, perSeatPrice and totalSeats are required");
  }




  // const newpoolD = await prisma.transaction(async (tx) => {


  // })
  const newPool: Pool = await prisma.pool.create({
    data: {
      name: name.toLowerCase(),
      perSeatPrice: perSeatPrice,
      totalSeats: parseInt(totalSeats),
    },
  });

  // creating seats for pool
  const seats = await createSeatsforPoolHelper(
    newPool.id,

    parseInt(totalSeats)
  );
  if (!seats) {
    throw new ApiError(500, "Failed to create seats for the pool");
  }

  return res
    .status(201)
    .json(
      new ApiResponse(201, { ...newPool, seats }, "Pool created successfully")
    );
});

const deletePool = asyncHandler(async (req: any, res: any) => {
  const poolId = req.params.publicId;
  const deletedPool = await prisma.pool.delete(
    {
      where: { publicId: poolId },
    }
    // Seats associated with the pool will be automatically deleted due to the cascade delete rule defined in the Prisma schema. This ensures that there are no orphaned seat records when a pool is deleted.,
  );

  if (!deletedPool) {
    throw new ApiError(404, "Pool not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, deletedPool, "Pool deleted successfully"));
});
export {
  getAllPools,
  getPoolById,
  createPool,
  deletePool,
  getPoolWithDetailsById,
};
