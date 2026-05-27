-- W11.4-followup: drop `sourceSpan` (UI-only highlight pointer; introduced
-- complexity without semantic weight at engine time), add `conditionNarrative`
-- (free-text qualifier the compile pass populates for rules whose conditions
-- don't fit the closed `category | urgency | jurisdiction | lineKind` enum).
--
-- The quote pipeline (W11.6) will use the narrative at quote time: for any rule
-- with a non-null `conditionNarrative`, the AI is asked whether the narrative
-- applies to the incoming opportunity context, and the rule's effect is only
-- committed on a yes.

ALTER TABLE "PricingRule" DROP COLUMN "sourceSpan";
ALTER TABLE "PricingRule" ADD COLUMN "conditionNarrative" TEXT;
