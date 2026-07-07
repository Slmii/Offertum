-- Backfill NULL `vatRates` (present on every org created before the 20260626080933_vat
-- migration, which added the column without NOT NULL/DEFAULT) to the empty array, matching
-- the application's documented fallback semantics (empty = falls back to DEFAULT_NL_VAT_CONFIG
-- in MeService.getVatSettings). Then lock the column down so this can't happen again.
UPDATE "Organization" SET "vatRates" = '{}' WHERE "vatRates" IS NULL;

ALTER TABLE "Organization" ALTER COLUMN "vatRates" SET DEFAULT '{}';
ALTER TABLE "Organization" ALTER COLUMN "vatRates" SET NOT NULL;
