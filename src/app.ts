import express, { urlencoded } from "express"
import cors from "cors";
import cookieParser from "cookie-parser";



const app = express()


app.use(cors({
    origin:process.env.CORS_ORIGIN,
    credentials:true
}))

// Razorpay webhook needs the exact raw bytes to verify its HMAC signature, so
// this route gets express.raw() and MUST be registered before express.json()
// (which would consume and re-parse the body, breaking the signature check).
app.use("/api/v1/webhooks/razorpay", express.raw({ type: "application/json", limit: "1mb" }))

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
import winnerRouter from "./routes/winner.routes.js"
import ledgerRouter from "./routes/ledger.routes.js"
import webhookRouter from "./routes/webhook.routes.js"

// routes declaration
app.use("/api/v1/users", userRouter)
app.use("/api/v1/admin", adminUserRouter)
app.use("/api/v1/pools",poolRouter)
app.use("/api/v1/bookings",bookingRouter)
app.use("/api/v1/seats",SeatRouter)
app.use("/api/v1/winners", winnerRouter)
app.use("/api/v1/ledger", ledgerRouter)
app.use("/api/v1/webhooks", webhookRouter)

// Global error handler — must be registered after all routes. Without this,
// an ApiError thrown anywhere (e.g. lookupTicket's 404) falls through to
// Express's default handler, which returns an HTML error page instead of
// JSON even though the status code is still correct. Any client parsing
// the body as JSON (like the frontend's proxy routes) would otherwise fail.
import { ApiError } from "./utils/ApiError.js"

app.use((err: any, req: any, res: any, next: any) => {
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            errors: err.errors,
            data: err.data
        })
    }

    console.error(err)
    return res.status(500).json({
        success: false,
        message: "Something went wrong"
    })
})

export { app }

// Vercel picks src/app.ts as the entry point and needs the Express app as the
// default export. The named export above is kept for src/index.ts.
export default app
