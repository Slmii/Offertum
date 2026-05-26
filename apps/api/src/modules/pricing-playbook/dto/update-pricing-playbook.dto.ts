import { PRICING_PLAYBOOK_TEXT_MAX_LENGTH, type UpdatePricingPlaybookInput } from '@quoteom/shared';
import { IsString, MaxLength } from 'class-validator';

/**
 * `PUT /api/pricing-playbook` request body. The cap matches the shared constant so
 * a runaway paste can't poison the compile-prompt token budget downstream.
 */
export class UpdatePricingPlaybookDto implements UpdatePricingPlaybookInput {
	@IsString()
	@MaxLength(PRICING_PLAYBOOK_TEXT_MAX_LENGTH)
	playbookText!: string;
}
