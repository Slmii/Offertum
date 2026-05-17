-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('new', 'replied', 'waiting', 'cold', 'won', 'lost');

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "emailAccountId" UUID NOT NULL,
    "rawMessageId" UUID NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'new',
    "aiProvider" TEXT NOT NULL,
    "classifierConfidence" DOUBLE PRECISION,
    "classifierReason" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "address" TEXT,
    "requestType" TEXT NOT NULL,
    "urgency" TEXT NOT NULL,
    "customerDeadline" TIMESTAMP(3),
    "customerAppointment" TIMESTAMP(3),
    "deliverableHints" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_rawMessageId_key" ON "Opportunity"("rawMessageId");

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_status_createdAt_idx" ON "Opportunity"("organizationId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_customerDeadline_idx" ON "Opportunity"("organizationId", "customerDeadline");

-- CreateIndex
CREATE INDEX "Opportunity_emailAccountId_idx" ON "Opportunity"("emailAccountId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_rawMessageId_fkey" FOREIGN KEY ("rawMessageId") REFERENCES "RawMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
