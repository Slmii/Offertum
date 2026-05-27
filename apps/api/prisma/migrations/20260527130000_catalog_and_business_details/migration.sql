-- W9.1 + W9.3 — CatalogItem (owner-maintained product/service catalog used by
-- the W10.1 AI line-item proposer) + business-details fields on Organization
-- (printed on quote PDFs once W9.4 lands).
--
-- Business details are all-nullable + carry a sane default for payment terms.
-- Existing orgs get NULL/30-day defaults; the quote PDF degrades gracefully
-- when fields are missing.

-- Organization business-details columns
ALTER TABLE "Organization"
  ADD COLUMN "companyName"             TEXT,
  ADD COLUMN "companyKvkNumber"        TEXT,
  ADD COLUMN "companyVatNumber"        TEXT,
  ADD COLUMN "companyAddress"          TEXT,
  ADD COLUMN "companyFooter"           TEXT,
  ADD COLUMN "defaultPaymentTermsDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "logoStorageKey"          TEXT;

-- CatalogItem table
CREATE TABLE "CatalogItem" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId"  UUID NOT NULL,
  "name"            TEXT NOT NULL,
  "description"     TEXT,
  "defaultPriceEur" DECIMAL(10, 2) NOT NULL,
  "defaultVatRate"  INTEGER NOT NULL DEFAULT 21,
  "sku"             TEXT,
  "unit"            TEXT NOT NULL DEFAULT 'piece',
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CatalogItem_organizationId_active_createdAt_idx"
  ON "CatalogItem" ("organizationId", "active", "createdAt" DESC);

ALTER TABLE "CatalogItem"
  ADD CONSTRAINT "CatalogItem_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Sanity guards: VAT rate sane, payment terms reasonable, price non-negative.
ALTER TABLE "CatalogItem"
  ADD CONSTRAINT "CatalogItem_defaultVatRate_chk"
  CHECK ("defaultVatRate" >= 0 AND "defaultVatRate" <= 30);

ALTER TABLE "CatalogItem"
  ADD CONSTRAINT "CatalogItem_defaultPriceEur_chk"
  CHECK ("defaultPriceEur" >= 0);

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_defaultPaymentTermsDays_chk"
  CHECK ("defaultPaymentTermsDays" >= 0 AND "defaultPaymentTermsDays" <= 365);
