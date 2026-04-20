-- AlterTable
ALTER TABLE "Pool" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "error" JSONB;
