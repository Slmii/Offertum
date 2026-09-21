-- CreateEnum
CREATE TYPE "InboundAttachmentStatus" AS ENUM ('PENDING', 'PARSED', 'EMPTY', 'UNSUPPORTED', 'TOO_LARGE', 'ENCRYPTED', 'FAILED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "aiAttachmentReadingEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "RawMessageAttachment" (
    "id" UUID NOT NULL,
    "rawMessageId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "providerAttachmentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "status" "InboundAttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "isTruncated" BOOLEAN NOT NULL DEFAULT false,
    "extractedText" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "fetchAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawMessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RawMessageAttachment_organizationId_idx" ON "RawMessageAttachment"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "RawMessageAttachment_rawMessageId_providerAttachmentId_key" ON "RawMessageAttachment"("rawMessageId", "providerAttachmentId");

-- AddForeignKey
ALTER TABLE "RawMessageAttachment" ADD CONSTRAINT "RawMessageAttachment_rawMessageId_fkey" FOREIGN KEY ("rawMessageId") REFERENCES "RawMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
