-- W4.4 follow-up: link Opportunity rows to the AICall rows that produced them,
-- and convert urgency from TEXT to a proper Postgres enum.

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('emergency', 'high', 'normal', 'low');

-- AlterTable: TEXT → Urgency. Existing rows are expected to already hold one of the four
-- legal values (the extractor's Zod enum enforces this on write), so the USING cast is
-- a no-op for valid data and fails loudly for anything malformed.
ALTER TABLE "Opportunity"
    ALTER COLUMN "urgency" TYPE "Urgency" USING "urgency"::text::"Urgency";

-- AlterTable: AICall FK columns. Nullable because AICall persistence is best-effort
-- (see `AICallLogger.record`).
ALTER TABLE "Opportunity" ADD COLUMN "classifiedAiCallId" UUID;
ALTER TABLE "Opportunity" ADD COLUMN "extractedAiCallId" UUID;

-- AddForeignKey: SetNull on delete so an AICall retention policy that purges old rows
-- never cascade-deletes real product data.
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_classifiedAiCallId_fkey"
    FOREIGN KEY ("classifiedAiCallId") REFERENCES "AICall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_extractedAiCallId_fkey"
    FOREIGN KEY ("extractedAiCallId") REFERENCES "AICall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: explicit indexes on FK columns — Postgres does not auto-index FK source
-- columns, and we'll join AICall ↔ Opportunity in the debug UI ("show me everything that
-- came from this prompt run").
CREATE INDEX "Opportunity_classifiedAiCallId_idx" ON "Opportunity"("classifiedAiCallId");
CREATE INDEX "Opportunity_extractedAiCallId_idx" ON "Opportunity"("extractedAiCallId");
