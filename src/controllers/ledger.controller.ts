import { LedgerDirection, LedgerEntryType } from "../db/generated/prisma/enums.js";
import { prisma } from "../db/index.js";
import { getLedgerForUser, getCurrentBalance, recordLedgerEntry } from "../services/ledger.service.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createPaginationHelper } from "../utils/paginationHelper.js";

// A user viewing their own ledger / running balance
const getMyLedger = asyncHandler(async (req: any, res: any) => {
    const userId = req.user?.id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const paginationHelper = createPaginationHelper(req.query.page, req.query.limit);
    const { entries, total } = await getLedgerForUser(userId, {
        skip: paginationHelper.skip,
        take: paginationHelper.take
    });
    const balance = await getCurrentBalance(userId);

    return res.status(200).json(
        new ApiResponse(
            200,
            { balance, ...paginationHelper.format(entries, total) },
            "Ledger fetched successfully"
        )
    );
});

// Admin viewing any user's ledger by their publicId
const getUserLedger = asyncHandler(async (req: any, res: any) => {
    const { userId: userPublicId } = req.params;

    if (!userPublicId) {
        throw new ApiError(400, "userId is required");
    }

    const user = await prisma.user.findUnique({
        where: { publicId: userPublicId },
        select: { id: true, name: true, phone: true, walletBalance: true }
    });

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const paginationHelper = createPaginationHelper(req.query.page, req.query.limit);
    const { entries, total } = await getLedgerForUser(user.id, {
        skip: paginationHelper.skip,
        take: paginationHelper.take
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                user: { name: user.name, phone: user.phone, balance: user.walletBalance },
                ...paginationHelper.format(entries, total)
            },
            "User ledger fetched successfully"
        )
    );
});

// Admin-only manual adjustment (corrections, goodwill credits, manual debits, etc.)
const createManualAdjustment = asyncHandler(async (req: any, res: any) => {
    const adminId = req.admin?.id;

    if (!adminId) {
        throw new ApiError(401, "Unauthorized");
    }

    const { userId: userPublicId, amount, direction, description } = req.body;

    if (!userPublicId || !amount || !direction) {
        throw new ApiError(400, "userId, amount, and direction are required");
    }

    if (![LedgerDirection.CREDIT, LedgerDirection.DEBIT].includes(direction)) {
        throw new ApiError(400, "direction must be either CREDIT or DEBIT");
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new ApiError(400, "Invalid amount value");
    }

    const user = await prisma.user.findUnique({
        where: { publicId: userPublicId },
        select: { id: true }
    });

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const entry = await prisma.$transaction(async (tx) => {
        return recordLedgerEntry(tx, {
            userId: user.id,
            type: direction === LedgerDirection.CREDIT
                ? LedgerEntryType.MANUAL_CREDIT
                : LedgerEntryType.MANUAL_DEBIT,
            direction,
            amount: parsedAmount,
            referenceType: "MANUAL",
            referenceId: null,
            description: description || "Manual adjustment by admin",
            createdByAdminId: adminId
        });
    });

    return res.status(201).json(
        new ApiResponse(201, entry, "Manual ledger adjustment recorded successfully")
    );
});

export { getMyLedger, getUserLedger, createManualAdjustment };
