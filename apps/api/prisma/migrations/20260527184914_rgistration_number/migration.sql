/*
  Warnings:

  - You are about to drop the column `companyKvkNumber` on the `Organization` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "companyKvkNumber",
ADD COLUMN     "companyRegistrationNumber" TEXT;
