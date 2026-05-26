-- Rename the `BTW` enum value (Dutch term for VAT) to `VAT` so the schema
-- identifier matches the English-only code convention. The Dutch-language UI
-- still says "BTW" — that's a render-time label, not a stored value.
ALTER TYPE "PricingRuleType" RENAME VALUE 'BTW' TO 'VAT';
