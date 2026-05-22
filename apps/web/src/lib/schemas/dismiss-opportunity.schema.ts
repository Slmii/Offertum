import { OPPORTUNITY_DISMISS_REASONS } from '@quoteom/shared';
import z from 'zod';

export const DismissOpportunitySchema = z.object({
	reason: z.enum(OPPORTUNITY_DISMISS_REASONS),
	notes: z
		.string()
		.max(500, 'Toelichting mag maximaal 500 tekens bevatten')
		.optional()
		.transform(value => value?.trim() || undefined)
});

export type DismissOpportunityForm = z.infer<typeof DismissOpportunitySchema>;
