/*
  Warnings:

  - Added the required column `prize` to the `Winner` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Winner" ADD COLUMN     "prize" DECIMAL(10,2) NOT NULL;
