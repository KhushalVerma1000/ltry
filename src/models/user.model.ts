import type { User } from "../db/generated/prisma/client.js";
import { prisma } from "../db/index.js";
import { passwordHash, comparePassword } from "../utils/autherisationHelper.js";

// Create new user
async function createUser(userData: Omit<User, "id">): Promise<User> {
    const hashedPassword = await passwordHash(userData.password);
    
    return await prisma.user.create({
        data: {
            ...userData,
            password: hashedPassword
        }
    });
}

// Find user by email


// Verify password
async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return await comparePassword(plainPassword, hashedPassword);
}

export { createUser, verifyPassword };