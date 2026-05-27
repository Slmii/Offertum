import type { PricingPlaybook } from '@offertum/shared';

/**
 * `GET /api/pricing-playbook` + `PUT /api/pricing-playbook` response. Carries the
 * settings-page-visible surface (prose + compile state + count) without exposing
 * the rule rows themselves — those land in W11.4's separate rule-list endpoint.
 */
export class PricingPlaybookResponseDto implements PricingPlaybook {
	playbookText!: string;
	compiledAt!: string | null;
	compiledHash!: string | null;
	rulesCount!: number;
	updatedAt!: string;
}
