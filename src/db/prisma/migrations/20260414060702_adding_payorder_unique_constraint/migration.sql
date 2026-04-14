/*
  Warnings:

  - A unique constraint covering the columns `[providerPaymentId]` on the table `Booking` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Booking_providerPaymentId_key" ON "Booking"("providerPaymentId");
