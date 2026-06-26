/*
  Warnings:

  - You are about to alter the column `defaultVatRate` on the `CatalogItem` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(5,2)`.
  - You are about to alter the column `vatRate` on the `QuoteLineItem` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(5,2)`.

*/
-- AlterTable
ALTER TABLE "CatalogItem" ALTER COLUMN "defaultVatRate" SET DEFAULT 21,
ALTER COLUMN "defaultVatRate" SET DATA TYPE DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "vatDefaultRate" DECIMAL(5,2) NOT NULL DEFAULT 21,
ADD COLUMN     "vatRates" DECIMAL(5,2)[],
ADD COLUMN     "vatReverseChargeEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "vatReverseChargeLabel" TEXT NOT NULL DEFAULT 'BTW verlegd';

-- AlterTable
ALTER TABLE "QuoteLineItem" ALTER COLUMN "vatRate" SET DEFAULT 21,
ALTER COLUMN "vatRate" SET DATA TYPE DECIMAL(5,2);
