import { createHash } from 'node:crypto';

import { PRICING_PLAYBOOK_RULE_NOT_FOUND } from '@/lib/errors';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestEvents } from '@/modules/inngest/inngest.constants';
import { LogService } from '@/modules/logger/log.service';
import { PricingPlaybookResponseDto } from '@/modules/pricing-playbook/dto/pricing-playbook.response.dto';
import { PRICING_COMPILE_STATUS_TO_WIRE } from '@/modules/pricing-playbook/pricing-compile-status.mapper';
import {
	PricingRuleResponseDto,
	PricingRulesListResponseDto
} from '@/modules/pricing-playbook/dto/pricing-rule.response.dto';
import {
	PricingPlaybookRepository,
	type PricingPlaybookRow,
	type PricingRuleRow
} from '@/modules/pricing-playbook/pricing-playbook.repository';
import { PRICING_RULE_TYPE_TO_WIRE } from '@/modules/pricing-playbook/pricing-rule-type.mapper';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { PricingRuleJsonObject } from '@offertum/shared';

@Injectable()
export class PricingPlaybookService {
	constructor(
		private readonly repository: PricingPlaybookRepository,
		private readonly logService: LogService
	) {}

	async get(organizationId: string): Promise<PricingPlaybookResponseDto> {
		const row = await this.repository.getOrCreate(organizationId);
		return toResponseDto(row);
	}

	/**
	 * Save the playbook prose + fire the `pricing-playbook.saved` Inngest event so
	 * the compile pass (W11.3) can re-derive rules. The Inngest function debounces
	 * 5s downstream, so rapid sequential saves collapse into one compile run.
	 *
	 * Inngest send is best-effort: a failed enqueue logs `warn` but does NOT abort
	 * the save. The owner's text is the source of truth; the worst case of a lost
	 * event is that rules don't recompile until the next save (and the operator
	 * has a clear audit trail of the failure).
	 */
	async update(organizationId: string, playbookText: string): Promise<PricingPlaybookResponseDto> {
		const row = await this.repository.updatePlaybookText(organizationId, playbookText);

		const playbookHash = createHash('sha256').update(playbookText).digest('hex');

		try {
			await inngest.send({
				name: InngestEvents.PricingPlaybookSaved,
				data: { organizationId, playbookHash }
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'unknown';
			this.logService.logAction({
				action: 'pricing_playbook.compile.enqueue_failed',
				message: `Failed to enqueue pricing-playbook compile for org ${organizationId}: ${message}`,
				metadata: { organizationId, playbookHash },
				level: 'warn',
				context: 'PricingPlaybookService'
			});
			// `updatePlaybookText` set status = PROCESSING, but with no compile enqueued it would hang
			// there forever (the FE polls "Bezig met verwerken" indefinitely). Flip to FAILED so the
			// owner sees "Verwerken mislukt" + a retry, which re-enqueues. Best-effort; the saved text
			// is safe regardless.
			await this.repository
				.markCompileFailed(organizationId, `Compile enqueue failed: ${message}`)
				.catch(() => undefined);
			return toResponseDto(await this.repository.getOrCreate(organizationId));
		}

		return toResponseDto(row);
	}

	async listRules(organizationId: string): Promise<PricingRulesListResponseDto> {
		const playbook = await this.repository.getOrCreate(organizationId);
		const rows = await this.repository.listRules(playbook.id);
		return { rules: rows.map(toRuleResponseDto) };
	}

	async updateRule(
		organizationId: string,
		ruleId: string,
		patch: {
			condition?: Record<string, unknown>;
			effect?: Record<string, unknown>;
			priority?: number;
			active?: boolean;
			description?: string;
			conditionNarrative?: string | null;
		}
	): Promise<PricingRuleResponseDto> {
		const playbook = await this.repository.getOrCreate(organizationId);
		const existing = await this.repository.findRuleByIdInPlaybook(playbook.id, ruleId);
		if (!existing) {
			throw new NotFoundException(PRICING_PLAYBOOK_RULE_NOT_FOUND);
		}
		const updated = await this.repository.updateRule(ruleId, patch);
		return toRuleResponseDto(updated);
	}

	async deleteRule(organizationId: string, ruleId: string): Promise<void> {
		const playbook = await this.repository.getOrCreate(organizationId);
		const existing = await this.repository.findRuleByIdInPlaybook(playbook.id, ruleId);
		if (!existing) {
			throw new NotFoundException(PRICING_PLAYBOOK_RULE_NOT_FOUND);
		}
		await this.repository.deleteRule(ruleId);
	}
}

function toRuleResponseDto(row: PricingRuleRow): PricingRuleResponseDto {
	// The DB CHECK constraint guarantees condition + effect are JSON objects, and
	// the only writers (compile pass + manual edit, both validated upstream) emit
	// JSON-safe values. The Prisma generated type widens to `unknown` but at
	// runtime the values are wire-serializable.
	return {
		id: row.id,
		ruleType: PRICING_RULE_TYPE_TO_WIRE[row.ruleType],
		condition: row.condition as PricingRuleJsonObject,
		effect: row.effect as PricingRuleJsonObject,
		priority: row.priority,
		active: row.active,
		description: row.description,
		conditionNarrative: row.conditionNarrative,
		manualOverride: row.manualOverride,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}

function toResponseDto(row: PricingPlaybookRow): PricingPlaybookResponseDto {
	return {
		playbookText: row.playbookText,
		compiledAt: row.compiledAt?.toISOString() ?? null,
		compiledHash: row.compiledHash,
		rulesCount: row.rulesCount,
		compileStatus: PRICING_COMPILE_STATUS_TO_WIRE[row.compileStatus],
		updatedAt: row.updatedAt.toISOString()
	};
}
