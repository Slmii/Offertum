-- CreateEnum
CREATE TYPE "ExpiryActionStatus" AS ENUM ('SUGGESTED', 'TAKEN', 'DISMISSED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ExpiryActionKind" AS ENUM ('EXTEND_14D', 'LAST_FOLLOWUP', 'MARK_LOST');

-- CreateTable
CREATE TABLE "ExpiryAction" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "quoteDraftId" UUID NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "ExpiryActionStatus" NOT NULL DEFAULT 'SUGGESTED',
    "recommendedAction" "ExpiryActionKind" NOT NULL,
    "suggestedCopy" TEXT NOT NULL,
    "takenAction" "ExpiryActionKind",
    "aiCallId" UUID,
    "takenById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpiryAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpiryAction_organizationId_status_idx" ON "ExpiryAction"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ExpiryAction_opportunityId_idx" ON "ExpiryAction"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpiryAction_quoteDraftId_validUntil_key" ON "ExpiryAction"("quoteDraftId", "validUntil");

-- AddForeignKey
ALTER TABLE "ExpiryAction" ADD CONSTRAINT "ExpiryAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpiryAction" ADD CONSTRAINT "ExpiryAction_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpiryAction" ADD CONSTRAINT "ExpiryAction_quoteDraftId_fkey" FOREIGN KEY ("quoteDraftId") REFERENCES "QuoteDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpiryAction" ADD CONSTRAINT "ExpiryAction_aiCallId_fkey" FOREIGN KEY ("aiCallId") REFERENCES "AICall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpiryAction" ADD CONSTRAINT "ExpiryAction_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
