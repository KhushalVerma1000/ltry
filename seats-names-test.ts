
import { getLastSeatNumberForPool,generateSeatNameForNewPool } from "./src/controllers/seats.controllers.js";

const lastNumber = await getLastSeatNumberForPool(15)
console.log(lastNumber)
generateSeatNameForNewPool(100, lastNumber)