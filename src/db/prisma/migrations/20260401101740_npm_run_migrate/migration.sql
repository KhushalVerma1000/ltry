-- AlterTable
ALTER TABLE "Winner" ADD COLUMN     "paid" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BookingSeat" (
    "id" SERIAL NOT NULL,
    "bookingId" TEXT NOT NULL,
    "seatId" INTEGER NOT NULL,
    "seatName" TEXT NOT NULL,
    "poolId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingSeat_bookingId_seatId_key" ON "BookingSeat"("bookingId", "seatId");

-- AddForeignKey
ALTER TABLE "BookingSeat" ADD CONSTRAINT "BookingSeat_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSeat" ADD CONSTRAINT "BookingSeat_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
