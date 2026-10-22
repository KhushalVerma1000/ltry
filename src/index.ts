import dotenv from "dotenv";
dotenv.config({
    path: "./.env"
});

import { app } from "./app.js";
import { connectDB } from "./db/index.js";

// Local / normal server: connect to the DB, then listen on a port.
// On Vercel the app runs as a serverless function: Vercel handles the HTTP
// side (no listen(), no port) and Prisma connects lazily on the first query.
if (!process.env.VERCEL) {
    connectDB()
        .then(() => {
            const port = process.env.PORT || 8000;
            app.listen(port, () => {
                console.log("Server is running on port", port);
            });
        })
        .catch((error) => {
            console.error("Failed to connect to database:", error);
        });
}

// Vercel looks for the Express app as the default export.
export default app;
