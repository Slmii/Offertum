-- Phase 2 / W11.1 — PricingPlaybook schema. Free-form playbook prose + AI-compiled
-- pricing rules. 1:1 with Organization, lazy-created on first read.
-- PricingRule.effect must always carry a `type` discriminator — the engine routes
-- on it, so a NULL/missing type is meaningless and we reject it at the DB layer.

CREATE TYPE "PricingRuleType" AS ENUM (
  'HOURLY_RATE',
  'MATERIAL_MARKUP',
  'BTW',
  'TRAVEL',
  'URGENCY',
  'DISCOUNT',
  'MINIMUM_ORDER'
);

CREATE TABLE "PricingPlaybook" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "playbookText"   TEXT NOT NULL DEFAULT '',
  "compiledAt"     TIMESTAMP(3),
  "compiledHash"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PricingPlaybook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PricingPlaybook_organizationId_key"
  ON "PricingPlaybook" ("organizationId");

ALTER TABLE "PricingPlaybook"
  ADD CONSTRAINT "PricingPlaybook_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PricingRule" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "pricingPlaybookId" UUID NOT NULL,
  "ruleType"          "PricingRuleType" NOT NULL,
  "condition"         JSONB NOT NULL,
  "effect"            JSONB NOT NULL,
  "priority"          INTEGER NOT NULL DEFAULT 0,
  "active"            BOOLEAN NOT NULL DEFAULT true,
  "description"       TEXT NOT NULL,
  "sourceSpan"        JSONB,
  "manualOverride"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PricingRule_pricingPlaybookId_active_priority_idx"
  ON "PricingRule" ("pricingPlaybookId", "active", "priority" DESC);

ALTER TABLE "PricingRule"
  ADD CONSTRAINT "PricingRule_pricingPlaybookId_fkey"
  FOREIGN KEY ("pricingPlaybookId") REFERENCES "PricingPlaybook"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- The effect blob must be a JSON object carrying a non-empty string `type`
-- discriminator. The engine routes on it; without it, the row is unrouteable.
-- Application-layer Zod schemas validate the full per-type shape; this constraint
-- only enforces the minimum invariant that makes the row processable at all.
ALTER TABLE "PricingRule"
  ADD CONSTRAINT "PricingRule_effect_has_type_chk"
  CHECK (
    jsonb_typeof("effect") = 'object'
    AND jsonb_typeof("effect"->'type') = 'string'
    AND length("effect"->>'type') > 0
  );

-- Same minimum-shape check on `condition` — must be an object (can be empty `{}`
-- for "always matches" rules, but never an array or scalar).
ALTER TABLE "PricingRule"
  ADD CONSTRAINT "PricingRule_condition_is_object_chk"
  CHECK (jsonb_typeof("condition") = 'object');

-- Folded in from the auto-generated `20260526091953_pricing_playbook` follow-up
-- (Prisma 7 generates UUIDs client-side; no DB-level DEFAULT needed). Kept in this
-- file rather than a separate one so shadow-DB replay sees a consistent order.
ALTER TABLE "PricingPlaybook" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "PricingRule" ALTER COLUMN "id" DROP DEFAULT;
