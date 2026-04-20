-- AlterTable
ALTER TABLE "AdminUser" ALTER COLUMN "refreshToken" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "providerOrderId" TEXT;

-- AlterTable
ALTER TABLE "Pool" ALTER COLUMN "validToDate" DROP NOT NULL,
ALTER COLUMN "validToDate" DROP DEFAULT;
