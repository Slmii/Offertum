import { toReadableNumber } from '@/lib/utils/number.utils';
import { PRICING_PLAYBOOK_TEXT_MAX_LENGTH } from '@offertum/shared';
import { z } from 'zod';

export const PricingPlaybookSchema = z.object({
	playbookText: z.string().max(PRICING_PLAYBOOK_TEXT_MAX_LENGTH, {
		message: `Maximaal ${toReadableNumber(PRICING_PLAYBOOK_TEXT_MAX_LENGTH)} tekens.`
	})
});

export type PricingPlaybookForm = z.infer<typeof PricingPlaybookSchema>;
