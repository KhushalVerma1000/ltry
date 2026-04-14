import { prisma } from "../db/index.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getwinnerForPool = asyncHandler(async (req: any, res: any) => {
    const { poolId } = req.params;
    if(!poolId){
        throw new ApiError(400, "Pool ID is required");
    }

    const pool = await prisma.pool.findUnique({
        where: { publicId: poolId }
    });
    if(!pool){
        throw new ApiError(404, "Pool not found");
    }

    const winners = await prisma.winner.findMany({
        where: { poolId: pool.id },
        orderBy: {
            position: "asc"
        },
        select:{
            id:true,
            position:true,
            prize:true,

            
            seat:{
                select:{
                    id:true,
                    name:true,
                    publicId:true,

                   booking:{
                    select:{
                        providerPaymentId:true,
                        user:{
                            select:{
                                name:true,
                                phone:true,
                                bankAccountNumber:true,
                                bankIFSCCode:true,
                                upiId:true,
                            }
                        }
                    }
                   }
                }
            }
        }
    });
    return res.status(200).json(new ApiResponse(200, winners, "Winners fetched successfully"));
});



const markWinnerPaid = asyncHandler(async (req: any, res: any) => {
    const { winnerId } = req.params;
    if(!winnerId){
        throw new ApiError(400, "Winner ID is required");
    }

    const winner = await prisma.winner.findUnique({
        where: { id: winnerId }
    });
    if(!winner){
        throw new ApiError(404, "Winner not found");
    }

    const updatedWinner = await prisma.winner.update({
        where: { id: winnerId },
        data: { paid: true }
    });
    return res.status(200).json(new ApiResponse(200, updatedWinner, "Winner marked as paid"));
})

export {getwinnerForPool, markWinnerPaid}