/*
  Warnings:

  - You are about to alter the column `perSeatPrice` on the `Pool` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(10,2)`.
  - You are about to drop the `Seats` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `payments` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "seatStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD');

-- CreateEnum
CREATE TYPE "bookingStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- DropForeignKey
ALTER TABLE "Seats" DROP CONSTRAINT "Seats_poolId_fkey";

-- DropForeignKey
ALTER TABLE "Seats" DROP CONSTRAINT "Seats_userId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_seatsId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_userId_fkey";

-- AlterTable
ALTER TABLE "Pool" ALTER COLUMN "perSeatPrice" SET DATA TYPE DECIMAL(10,2);

-- DropTable
DROP TABLE "Seats";

-- DropTable
DROP TABLE "payments";

-- CreateTable
CREATE TABLE "Seat" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "poolId" INTEGER NOT NULL,
    "status" "seatStatus" NOT NULL DEFAULT 'AVAILABLE',
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "providerPaymentId" TEXT,
    "status" "bookingStatus" NOT NULL DEFAULT 'PENDING',
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Seat_name_key" ON "Seat"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_bookingId_key" ON "Seat"("bookingId");

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
