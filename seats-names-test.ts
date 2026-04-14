
import { getLastSeatNumberForPool,generateSeatNameForNewPool } from "./src/controllers/seats.controllers.js";

let lastNumber = await getLastSeatNumberForPool(15)
console.log(lastNumber)
generateSeatNameForNewPool(100, lastNumber)