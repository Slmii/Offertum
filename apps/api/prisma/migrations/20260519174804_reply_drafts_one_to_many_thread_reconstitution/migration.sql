-- DropIndex
DROP INDEX "ReplyDraft_opportunityId_key";

-- AlterTable
ALTER TABLE "RawMessage" ADD COLUMN     "opportunityId" UUID;

-- CreateIndex
CREATE INDEX "RawMessage_opportunityId_idx" ON "RawMessage"("opportunityId");

-- CreateIndex
CREATE INDEX "ReplyDraft_opportunityId_createdAt_idx" ON "ReplyDraft"("opportunityId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "RawMessage" ADD CONSTRAINT "RawMessage_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
