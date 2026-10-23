import { PayoutVerificationStatus } from "../db/generated/prisma/client.js";
import { prisma } from "../db/index.js";
import { recordAdminAudit } from "../services/auditLog.service.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createPaginationHelper } from "../utils/paginationHelper.js";

const STATUSES = Object.values(PayoutVerificationStatus) as string[];

/**
 * GET /api/v1/admin/payout-verifications?status=UNVERIFIED|VERIFIED|REJECTED&page=&limit=
 *
 * Users an admin needs to review before paying them. Includes each user's
 * unpaid winnings so the admin can see who is actually waiting on a payout.
 * Always 3 queries (users, count, unpaid winners for the page), never one per user.
 */
const listPayoutVerifications = asyncHandler(async (req: any, res: any) => {
    const rawStatus = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "UNVERIFIED";

    if (!STATUSES.includes(rawStatus)) {
        throw new ApiError(400, `status must be one of ${STATUSES.join(", ")}`);
    }
    const status = rawStatus as PayoutVerificationStatus;

    const paginationHelper = createPaginationHelper(req.query.page, req.query.limit);

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where: { payoutVerification: status },
            orderBy: { createdAt: "desc" },
            skip: paginationHelper.skip,
            take: paginationHelper.take,
            select: {
                publicId: true,
                id: true,
                name: true,
                phone: true,
                bankAccountNumber: true,
                bankIFSCCode: true,
                upiId: true,
                payoutVerification: true,
                payoutVerifiedAt: true,
                payoutVerificationNote: true,
                createdAt: true
            }
        }),
        prisma.user.count({ where: { payoutVerification: status } })
    ]);

    // One query for the whole page: unpaid winners whose live seat booking
    // belongs to one of these users.
    const userIds = users.map((u) => u.id);
    const unpaid = userIds.length
        ? await prisma.winner.findMany({
              where: {
                  paid: false,
                  seat: { booking: { status: "COMPLETED", userId: { in: userIds } } }
              },
              select: { prize: true, seat: { select: { booking: { select: { userId: true } } } } }
          })
        : [];

    const unpaidByUser = new Map<number, { count: number; amount: number }>();
    for (const w of unpaid) {
        const uid = w.seat.booking?.userId;
        if (uid === undefined) continue;
        const cur = unpaidByUser.get(uid) ?? { count: 0, amount: 0 };
        cur.count += 1;
        cur.amount += Number(w.prize);
        unpaidByUser.set(uid, cur);
    }

    const rows = users.map(({ id, ...u }) => ({
        ...u,
        unpaidWinnings: unpaidByUser.get(id) ?? { count: 0, amount: 0 }
    }));

    return res
        .status(200)
        .json(new ApiResponse(200, paginationHelper.format(rows, total), "Payout verifications fetched"));
});

/**
 * PATCH /api/v1/admin/users/:userId/payout-verification
 * body: { status: "VERIFIED" | "REJECTED" | "UNVERIFIED", note?: string }
 *
 * `note` is shown to the user when REJECTED, so it is required then.
 */
const setPayoutVerification = asyncHandler(async (req: any, res: any) => {
    const adminId = req.admin?.id;
    if (!adminId) {
        throw new ApiError(401, "Unauthorized");
    }

    const { userId: userPublicId } = req.params;
    const { status, note } = req.body ?? {};

    if (typeof userPublicId !== "string" || !userPublicId) {
        throw new ApiError(400, "userId is required");
    }
    if (typeof status !== "string" || !STATUSES.includes(status)) {
        throw new ApiError(400, `status must be one of ${STATUSES.join(", ")}`);
    }
    if (note !== undefined && note !== null && typeof note !== "string") {
        throw new ApiError(400, "note must be text");
    }

    const cleanNote = typeof note === "string" ? note.trim().slice(0, 500) : "";
    if (status === PayoutVerificationStatus.REJECTED && !cleanNote) {
        throw new ApiError(400, "Give a reason when rejecting; the user will see it");
    }

    const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
            where: { publicId: userPublicId },
            select: { id: true, payoutVerification: true }
        });
        if (!user) {
            throw new ApiError(404, "User not found");
        }

        const result = await tx.user.update({
            where: { id: user.id },
            data: {
                payoutVerification: status as PayoutVerificationStatus,
                payoutVerifiedAt: status === PayoutVerificationStatus.UNVERIFIED ? null : new Date(),
                payoutVerifiedByAdminId: status === PayoutVerificationStatus.UNVERIFIED ? null : adminId,
                payoutVerificationNote: cleanNote || null
            },
            select: {
                publicId: true,
                name: true,
                payoutVerification: true,
                payoutVerifiedAt: true,
                payoutVerificationNote: true
            }
        });

        await recordAdminAudit(tx, {
            adminId,
            action: "PAYOUT_VERIFICATION_SET",
            targetType: "USER",
            targetId: result.publicId,
            details: { from: user.payoutVerification, to: status, note: cleanNote || null }
        });

        return result;
    });

    return res.status(200).json(new ApiResponse(200, updated, "Payout verification updated"));
});

export { listPayoutVerifications, setPayoutVerification };
