import express, { urlencoded } from "express"
import cors from "cors";
import cookieParser from "cookie-parser";



const app = express()


app.use(cors({
    origin:process.env.CORS_ORIGIN,
    credentials:true
}))

app.use(express.json({limit:"16kb"}))
app.use(urlencoded({extended:true,limit:"16kb"}))
app.use(express.static("public"))
app.use(cookieParser())


// routes

import userRouter from "./routes/user.routes.js"
import adminUserRouter from "./routes/adminUser.routes.js"
import poolRouter from "./routes/pool.routees.js"
import bookingRouter from "./routes/bookSeat.routes.js"
import SeatRouter from "./routes/seats.routes.js"

// routes declaration
app.use("/api/v1/users", userRouter)
app.use("/api/v1/admin", adminUserRouter)
app.use("/api/v1/pools",poolRouter)
app.use("/api/v1/bookings",bookingRouter)
app.use("/api/v1/seats",SeatRouter)

export {app}