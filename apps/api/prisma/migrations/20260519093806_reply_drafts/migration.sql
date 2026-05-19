-- CreateEnum
CREATE TYPE "ReplyDraftStatus" AS ENUM ('PENDING_APPROVAL', 'EDITED', 'SENT');

-- CreateTable
CREATE TABLE "ReplyDraft" (
    "id" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "originalBody" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ReplyDraftStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "wasEditedByUser" BOOLEAN NOT NULL DEFAULT false,
    "aiCallId" UUID,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplyDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReplyDraft_opportunityId_key" ON "ReplyDraft"("opportunityId");

-- CreateIndex
CREATE INDEX "ReplyDraft_status_createdAt_idx" ON "ReplyDraft"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ReplyDraft_aiCallId_idx" ON "ReplyDraft"("aiCallId");

-- AddForeignKey
ALTER TABLE "ReplyDraft" ADD CONSTRAINT "ReplyDraft_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyDraft" ADD CONSTRAINT "ReplyDraft_aiCallId_fkey" FOREIGN KEY ("aiCallId") REFERENCES "AICall"("id") ON DELETE SET NULL ON UPDATE CASCADE;
