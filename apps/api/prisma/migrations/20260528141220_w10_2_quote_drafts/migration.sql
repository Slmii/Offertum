-- CreateEnum
CREATE TYPE "QuoteDraftStatus" AS ENUM ('DRAFT', 'SENT');

-- CreateEnum
CREATE TYPE "QuoteLineSource" AS ENUM ('CATALOG_MATCH', 'RULE_APPLIED', 'INFERRED');

-- CreateTable
CREATE TABLE "QuoteDraft" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "status" "QuoteDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "generationContext" JSONB NOT NULL,
    "aiCallId" UUID,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLineItem" (
    "id" UUID NOT NULL,
    "quoteDraftId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitPriceEur" DECIMAL(10,2),
    "vatRate" INTEGER NOT NULL DEFAULT 21,
    "source" "QuoteLineSource" NOT NULL,
    "catalogItemId" UUID,
    "appliedRuleId" UUID,
    "note" TEXT,
    "wasEditedByUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteDraft_opportunityId_createdAt_idx" ON "QuoteDraft"("opportunityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "QuoteDraft_organizationId_status_createdAt_idx" ON "QuoteDraft"("organizationId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "QuoteDraft_aiCallId_idx" ON "QuoteDraft"("aiCallId");

-- CreateIndex
CREATE INDEX "QuoteLineItem_quoteDraftId_position_idx" ON "QuoteLineItem"("quoteDraftId", "position");

-- AddForeignKey
ALTER TABLE "QuoteDraft" ADD CONSTRAINT "QuoteDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteDraft" ADD CONSTRAINT "QuoteDraft_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteDraft" ADD CONSTRAINT "QuoteDraft_aiCallId_fkey" FOREIGN KEY ("aiCallId") REFERENCES "AICall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "QuoteLineItem_quoteDraftId_fkey" FOREIGN KEY ("quoteDraftId") REFERENCES "QuoteDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
