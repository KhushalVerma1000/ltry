/*
  Warnings:

  - You are about to drop the column `tokenexpiresAT` on the `Booking` table. All the data in the column will be lost.
  - The `status` column on the `Booking` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `validFromDate` on the `Pool` table. All the data in the column will be lost.
  - You are about to drop the column `validToDate` on the `Pool` table. All the data in the column will be lost.
  - The `status` column on the `Seat` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `PaymentGateway` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `Winner` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[roundId,name]` on the table `Seat` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[roundId,position]` on the table `Winner` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `roundId` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tokenExpiresAt` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `priceAtBooking` to the `BookingSeat` table without a default value. This is not possible if the table is not empty.
  - Added the required column `roundId` to the `BookingSeat` table without a default value. This is not possible if the table is not empty.
  - Added the required column `roundId` to the `Seat` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paymentGateway` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Made the column `refreshToken` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `bankAccountNumber` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `bankIFSCCode` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `upiId` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `roundId` to the `Winner` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'DRAWING', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SeatStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "Seat" DROP CONSTRAINT "Seat_poolId_fkey";

-- DropForeignKey
ALTER TABLE "Winner" DROP CONSTRAINT "Winner_poolId_fkey";

-- DropIndex
DROP INDEX "Seat_name_key";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "tokenexpiresAT",
ADD COLUMN     "roundId" INTEGER NOT NULL,
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "BookingStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "BookingSeat" ADD COLUMN     "priceAtBooking" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "roundId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Pool" DROP COLUMN "validFromDate",
DROP COLUMN "validToDate";

-- AlterTable
ALTER TABLE "Seat" ADD COLUMN     "roundId" INTEGER NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "SeatStatus" NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "PaymentGateway",
ADD COLUMN     "paymentGateway" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "refreshToken" SET NOT NULL,
ALTER COLUMN "bankAccountNumber" SET NOT NULL,
ALTER COLUMN "bankIFSCCode" SET NOT NULL,
ALTER COLUMN "upiId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Winner" DROP COLUMN "date",
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "roundId" INTEGER NOT NULL;

-- DropEnum
DROP TYPE "bookingStatus";

-- DropEnum
DROP TYPE "seatStatus";

-- CreateTable
CREATE TABLE "PoolRound" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "poolId" INTEGER NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'UPCOMING',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "drawnAt" TIMESTAMP(3),
    "priceSnapshot" DECIMAL(10,2) NOT NULL,
    "seatsSnapshot" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoolRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PoolRound_publicId_key" ON "PoolRound"("publicId");

-- CreateIndex
CREATE INDEX "PoolRound_poolId_status_idx" ON "PoolRound"("poolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PoolRound_poolId_roundNumber_key" ON "PoolRound"("poolId", "roundNumber");

-- CreateIndex
CREATE INDEX "Booking_roundId_status_idx" ON "Booking"("roundId", "status");

-- CreateIndex
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");

-- CreateIndex
CREATE INDEX "BookingSeat_roundId_idx" ON "BookingSeat"("roundId");

-- CreateIndex
CREATE INDEX "BookingSeat_poolId_idx" ON "BookingSeat"("poolId");

-- CreateIndex
CREATE INDEX "Seat_roundId_status_idx" ON "Seat"("roundId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_roundId_name_key" ON "Seat"("roundId", "name");

-- CreateIndex
CREATE INDEX "Transaction_bookingId_idx" ON "Transaction"("bookingId");

-- CreateIndex
CREATE INDEX "Winner_roundId_idx" ON "Winner"("roundId");

-- CreateIndex
CREATE INDEX "Winner_poolId_idx" ON "Winner"("poolId");

-- CreateIndex
CREATE UNIQUE INDEX "Winner_roundId_position_key" ON "Winner"("roundId", "position");

-- AddForeignKey
ALTER TABLE "PoolRound" ADD CONSTRAINT "PoolRound_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "PoolRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "PoolRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "PoolRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
