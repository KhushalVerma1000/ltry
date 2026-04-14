import type { Pool } from "../db/generated/prisma/client.js";
import { ApiError } from "./ApiError.js";

function getPrizeArray(pool: Pool, winnerSeats: any[]) {
    const prizeArray: any[] = [];
    const totalSeats = pool.totalSeats;
    const perSeatPrice = Number(pool.perSeatPrice);
    const totalPoolAmount = totalSeats * perSeatPrice;

    if (winnerSeats.length > totalSeats) {
        throw new ApiError(400, "Winner seats cannot be more than total seats");
    }




    winnerSeats.forEach((winnerSeat) => {
        let prize
        if (winnerSeat.position == 1) {
            prize = totalPoolAmount * 0.11
        } else if (winnerSeat.position == 2) {
            prize = totalPoolAmount * 0.08
        } else if (winnerSeat.position == 3) {
            prize = totalPoolAmount * 0.05
        } else {
            prize = perSeatPrice
        }
        prizeArray.push({
            seatId: winnerSeat.seatId,
            position: winnerSeat.position,
            prize: prize,
            poolId:pool.id
        });
    });
    return prizeArray;
}


export { getPrizeArray }