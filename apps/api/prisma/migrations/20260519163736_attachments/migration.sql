-- CreateTable
CREATE TABLE "ReplyDraftAttachment" (
    "id" UUID NOT NULL,
    "replyDraftId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "storageDriver" TEXT NOT NULL DEFAULT 'local',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplyDraftAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReplyDraftAttachment_replyDraftId_idx" ON "ReplyDraftAttachment"("replyDraftId");

-- AddForeignKey
ALTER TABLE "ReplyDraftAttachment" ADD CONSTRAINT "ReplyDraftAttachment_replyDraftId_fkey" FOREIGN KEY ("replyDraftId") REFERENCES "ReplyDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
