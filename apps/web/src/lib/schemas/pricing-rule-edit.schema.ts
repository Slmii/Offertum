import { z } from 'zod';

/**
 * Inline-edit form for a single PricingRule (review-UI modal). Only the fields
 * the owner can meaningfully tweak — `ruleType` + `condition` shape are fixed
 * by the compile pass; editing those would mean creating a new rule, which the
 * owner does by adjusting the playbook prose.
 */
export const PricingRuleEditSchema = z.object({
	description: z.string().trim().min(1, 'Geef een korte omschrijving op.').max(500),
	value: z.coerce.number({ message: 'Geef een geldig getal op.' }),
	priority: z.coerce.number().int().min(0, 'Tussen 0 en 1000.').max(1000, 'Tussen 0 en 1000.'),
	active: z.boolean(),
	// Free-text AI-condition. Empty string = no narrative (clears server-side to
	// `null`). Stored in the owner's prose language — the AI verifier at quote
	// time accepts any language alongside the opp context.
	conditionNarrative: z.string().max(500, 'Max 500 tekens.')
});

export type PricingRuleEditForm = z.infer<typeof PricingRuleEditSchema>;
