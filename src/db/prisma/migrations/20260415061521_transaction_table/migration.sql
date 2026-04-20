/*
  Warnings:

  - You are about to drop the column `providerPaymentId` on the `Booking` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "TransactionAttemptStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "bookingStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "bookingStatus" ADD VALUE 'CANCELLED';

-- DropIndex
DROP INDEX "Booking_providerPaymentId_key";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "providerPaymentId",
ADD COLUMN     "tokenexpiresAT" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "PaymentGateway" TEXT NOT NULL,
    "gatewayOrderId" TEXT NOT NULL,
    "gatewayPaymentId" TEXT NOT NULL,
    "transactionAttemptStatus" "TransactionAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "bookingId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
