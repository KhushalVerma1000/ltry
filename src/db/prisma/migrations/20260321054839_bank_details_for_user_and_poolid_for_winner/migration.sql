/*
  Warnings:

  - Added the required column `poolId` to the `Winner` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_userId_fkey";

-- DropForeignKey
ALTER TABLE "Winner" DROP CONSTRAINT "Winner_seatId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankIFSCCode" TEXT,
ADD COLUMN     "upiId" TEXT;

-- AlterTable
ALTER TABLE "Winner" ADD COLUMN     "poolId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
