-- W6.1 + W6.2 — Follow-up automation.
--
-- 1. Per-org cadence + cap on auto-generated follow-ups
--    `followUpCadenceDays` = days of silence before a check-in fires (default 4).
--    `followUpMaxCount`    = max auto follow-ups per opportunity (0 = disabled).
-- 2. `ReplyDraftKind` enum + `ReplyDraft.kind` column tagging scheduler-generated
--    drafts so the UI can distinguish them and the cap-counter doesn't double-count
--    owner-initiated drafts.
--
-- Both columns default to safe values so no backfill is required.

CREATE TYPE "ReplyDraftKind" AS ENUM ('REPLY', 'CHECK_IN');

ALTER TABLE "Organization"
    ADD COLUMN "followUpCadenceDays" INTEGER NOT NULL DEFAULT 4,
    ADD COLUMN "followUpMaxCount"    INTEGER NOT NULL DEFAULT 2;

-- Defensive bounds — match the DTO's class-validator range so a future bad DB write
-- (manual SQL, broken migration, etc.) can't poison the scheduler.
ALTER TABLE "Organization"
    ADD CONSTRAINT "Organization_followUpCadenceDays_range"
        CHECK ("followUpCadenceDays" BETWEEN 1 AND 30),
    ADD CONSTRAINT "Organization_followUpMaxCount_range"
        CHECK ("followUpMaxCount" BETWEEN 0 AND 5);

ALTER TABLE "ReplyDraft"
    ADD COLUMN "kind" "ReplyDraftKind" NOT NULL DEFAULT 'REPLY';
