import { error } from "node:console";
import { app } from "./app.js";
import {connectDB} from "./db/index.js";





connectDB()
.then(()=>{
    app.listen(process.env.PORT || 8000,()=>{
        console.log("Server is running on port ",process.env.PORT)
    })
})
.catch((error)=>{
    console.error("Failed to connect to database:", error);
})