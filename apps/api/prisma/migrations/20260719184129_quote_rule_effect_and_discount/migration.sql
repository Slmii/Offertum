-- AlterTable
ALTER TABLE "QuoteDraft" ADD COLUMN     "discountType" TEXT,
ADD COLUMN     "discountValue" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "QuoteLineItem" ADD COLUMN     "ruleEffectType" TEXT;
