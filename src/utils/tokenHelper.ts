import jwt from 'jsonwebtoken';

// Generic token payload interface
interface TokenPayload {
    id: string | number;
    type?: string;
    phone?: string;
    email?: string;
}

// Constants for token expiry
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Generic function to generate access token
export const generateAccessToken = (payload: TokenPayload): string => {
    const secret = process.env.ACCESS_TOKEN_SECRET;
    
    if (!secret) {
        throw new Error('ACCESS_TOKEN_SECRET is not defined');
    }
    
    return jwt.sign(payload, secret, { 
        expiresIn: ACCESS_TOKEN_EXPIRY
    });
};

// Generic function to generate refresh token
export const generateRefreshToken = (payload: TokenPayload): string => {
    const secret = process.env.REFRESH_TOKEN_SECRET;
    
    if (!secret) {
        throw new Error('REFRESH_TOKEN_SECRET is not defined');
    }
    
    return jwt.sign(payload, secret, { 
        expiresIn: REFRESH_TOKEN_EXPIRY
    });
};

// Verify access token
export const verifyAccessToken = (token: string): TokenPayload => {
    try {
        const secret = process.env.ACCESS_TOKEN_SECRET;
        if (!secret) {
            throw new Error('ACCESS_TOKEN_SECRET is not defined');
        }
        return jwt.verify(token, secret) as TokenPayload;
    } catch (error) {
        throw new Error('Invalid access token');
    }
};

// Verify refresh token
export const verifyRefreshToken = (token: string): TokenPayload => {
    try {
        const secret = process.env.REFRESH_TOKEN_SECRET;
        if (!secret) {
            throw new Error('REFRESH_TOKEN_SECRET is not defined');
        }
        return jwt.verify(token, secret) as TokenPayload;
    } catch (error) {
        throw new Error('Invalid refresh token');
    }
};

// Helper functions for specific user types
export const generateUserTokens = (userId: number, phone: bigint) => {
    const accessToken = generateAccessToken({ 
        id: userId, 
        phone: phone.toString(),
        type: 'user' 
    });
    const refreshToken = generateRefreshToken({ 
        id: userId,
        type: 'user'
    });
    
    return { accessToken, refreshToken };
};

export const generateAdminTokens = (adminId: string, email: string) => {
    const accessToken = generateAccessToken({ 
        id: adminId, 
        email,
        type: 'admin' 
    });
    const refreshToken = generateRefreshToken({ 
        id: adminId,
        type: 'admin'
    });
    
    return { accessToken, refreshToken };
};