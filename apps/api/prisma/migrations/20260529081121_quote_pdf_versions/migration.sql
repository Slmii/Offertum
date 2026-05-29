-- AlterTable
ALTER TABLE "ReplyDraftAttachment" ADD COLUMN     "quotePdfId" UUID;

-- CreateTable
CREATE TABLE "QuotePdf" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "quoteDraftId" UUID,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/pdf',
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "storageDriver" TEXT NOT NULL DEFAULT 'local',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotePdf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuotePdf_opportunityId_createdAt_idx" ON "QuotePdf"("opportunityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "QuotePdf_organizationId_idx" ON "QuotePdf"("organizationId");

-- CreateIndex
CREATE INDEX "QuotePdf_quoteDraftId_idx" ON "QuotePdf"("quoteDraftId");

-- CreateIndex
CREATE INDEX "ReplyDraftAttachment_quotePdfId_idx" ON "ReplyDraftAttachment"("quotePdfId");

-- AddForeignKey
ALTER TABLE "ReplyDraftAttachment" ADD CONSTRAINT "ReplyDraftAttachment_quotePdfId_fkey" FOREIGN KEY ("quotePdfId") REFERENCES "QuotePdf"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotePdf" ADD CONSTRAINT "QuotePdf_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotePdf" ADD CONSTRAINT "QuotePdf_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotePdf" ADD CONSTRAINT "QuotePdf_quoteDraftId_fkey" FOREIGN KEY ("quoteDraftId") REFERENCES "QuoteDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
