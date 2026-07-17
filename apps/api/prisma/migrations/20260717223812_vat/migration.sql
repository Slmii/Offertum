/*
  Warnings:

  - You are about to drop the column `vatDefaultRate` on the `Organization` table. All the data in the column will be lost.
  - The `vatRates` column on the `Organization` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "vatDefaultRate",
DROP COLUMN "vatRates",
ADD COLUMN     "vatRates" JSONB NOT NULL DEFAULT '[]';
