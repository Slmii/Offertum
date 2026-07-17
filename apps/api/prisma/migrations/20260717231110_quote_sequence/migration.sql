-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "quoteSequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "QuoteDraft" ADD COLUMN     "quoteNumber" TEXT;

-- AlterTable
ALTER TABLE "QuotePdf" ADD COLUMN     "quoteNumber" TEXT;
