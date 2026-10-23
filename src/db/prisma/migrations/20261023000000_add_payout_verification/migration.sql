-- CreateEnum
CREATE TYPE "PayoutVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "payoutVerification" "PayoutVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "payoutVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "payoutVerifiedByAdminId" TEXT,
  ADD COLUMN "payoutVerificationNote" TEXT;

-- CreateIndex
CREATE INDEX "User_payoutVerification_idx" ON "User"("payoutVerification");

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminId_createdAt_idx" ON "AdminAuditLog"("adminId", "createdAt");

-- Backfill: users who were already paid a prize by hand before this check
-- existed are treated as verified, so existing payouts are not disrupted.
UPDATE "User" u
SET "payoutVerification" = 'VERIFIED',
    "payoutVerifiedAt" = NOW(),
    "payoutVerificationNote" = 'Backfilled: paid before payout verification existed'
WHERE EXISTS (
    SELECT 1
    FROM "Winner" w
    JOIN "Seat" s ON s."id" = w."seatId"
    JOIN "Booking" b ON b."id" = s."bookingId"
    WHERE w."paid" = true AND b."userId" = u."id"
);
