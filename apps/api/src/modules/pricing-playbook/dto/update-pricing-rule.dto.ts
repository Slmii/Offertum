import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/**
 * `PATCH /api/pricing-playbook/rules/:id` request body. All fields optional —
 * the owner edits one at a time from the review UI. Any successful patch flips
 * `manualOverride: true` server-side (not part of the wire shape — set by the
 * repository).
 *
 * `ruleType` + `sourceSpan` are intentionally NOT patchable here. The owner can
 * delete the rule + re-create it (or let the next compile pass produce it) if
 * the type is wrong.
 */
export class UpdatePricingRuleDto {
	@IsOptional()
	@IsObject()
	condition?: Record<string, unknown>;

	@IsOptional()
	@IsObject()
	effect?: Record<string, unknown>;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(1000)
	priority?: number;

	@IsOptional()
	@IsBoolean()
	active?: boolean;

	@IsOptional()
	@IsString()
	@MinLength(1)
	@MaxLength(500)
	description?: string;
}
