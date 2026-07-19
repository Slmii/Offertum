import type { Prisma } from '@/generated/prisma/client';
import {
	PricingCompileStatus as PrismaPricingCompileStatus,
	PricingRuleType as PrismaPricingRuleType
} from '@/generated/prisma/enums';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

/**
 * Shape returned to the service layer. Carries the playbook scalars + the
 * `rulesCount` aggregate the settings page renders alongside the compile state.
 */
export interface PricingPlaybookRow {
	id: string;
	playbookText: string;
	compiledAt: Date | null;
	compiledHash: string | null;
	rulesCount: number;
	compileStatus: PrismaPricingCompileStatus;
	updatedAt: Date;
}

/** Row shape returned by the rule-CRUD methods. Mirrors the Prisma type but
 * narrows the JSON columns to `Record<string, unknown>` since the DB CHECK
 * constraint guarantees `condition` + `effect` are objects. */
export interface PricingRuleRow {
	id: string;
	pricingPlaybookId: string;
	ruleType: PrismaPricingRuleType;
	condition: Record<string, unknown>;
	effect: Record<string, unknown>;
	priority: number;
	active: boolean;
	description: string;
	conditionNarrative: string | null;
	manualOverride: boolean;
	createdAt: Date;
	updatedAt: Date;
}

/** Single rule the compile pass wants to upsert. `pricingPlaybookId` is filled
 * in by the repository from the orgId lookup; LLM output doesn't include it. */
export interface CompileRuleInput {
	ruleType: PrismaPricingRuleType;
	condition: Record<string, unknown>;
	effect: Record<string, unknown>;
	priority: number;
	description: string;
	conditionNarrative: string | null;
}

@Injectable()
export class PricingPlaybookRepository {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Lazy-create-on-first-read. The org's PricingPlaybook row is created on demand
	 * the first time the settings page loads, so existing orgs don't need a
	 * one-shot data-migration step to backfill empty playbooks. Subsequent reads
	 * hit the existing row.
	 *
	 * Upsert is the right primitive here: the `organizationId @unique` constraint
	 * keeps it idempotent under concurrent reads (two members opening the settings
	 * page at the same instant won't double-create).
	 */
	async getOrCreate(organizationId: string): Promise<PricingPlaybookRow> {
		const row = await this.prisma.pricingPlaybook.upsert({
			where: { organizationId },
			update: {},
			create: { organizationId },
			select: {
				id: true,
				playbookText: true,
				compiledAt: true,
				compiledHash: true,
				compileStatus: true,
				updatedAt: true,
				_count: { select: { rules: { where: { active: true } } } }
			}
		});
		return {
			id: row.id,
			playbookText: row.playbookText,
			compiledAt: row.compiledAt,
			compiledHash: row.compiledHash,
			compileStatus: row.compileStatus,
			updatedAt: row.updatedAt,
			rulesCount: row._count.rules
		};
	}

	/**
	 * Update the playbook prose. Re-running the upsert pattern lets us update an
	 * existing row OR materialize one if the owner somehow PUT before GET. The
	 * `_count` re-fetch on the same row gives the caller a fresh active-rules
	 * count for the response payload — typically 0 right after a save (rules
	 * land asynchronously via the compile pass).
	 */
	async updatePlaybookText(organizationId: string, playbookText: string): Promise<PricingPlaybookRow> {
		const row = await this.prisma.pricingPlaybook.upsert({
			where: { organizationId },
			// A save always (re)triggers the debounced compile — mark PROCESSING now so the
			// settings page shows "Bezig met verwerken" immediately, before the Inngest run.
			update: { playbookText, compileStatus: PrismaPricingCompileStatus.PROCESSING, compileError: null },
			create: { organizationId, playbookText, compileStatus: PrismaPricingCompileStatus.PROCESSING },
			select: {
				id: true,
				playbookText: true,
				compiledAt: true,
				compiledHash: true,
				compileStatus: true,
				updatedAt: true,
				_count: { select: { rules: { where: { active: true } } } }
			}
		});
		return {
			id: row.id,
			playbookText: row.playbookText,
			compiledAt: row.compiledAt,
			compiledHash: row.compiledHash,
			compileStatus: row.compileStatus,
			updatedAt: row.updatedAt,
			rulesCount: row._count.rules
		};
	}

	/**
	 * Find the PricingPlaybook by organizationId. Used by the compile function
	 * which receives only the orgId in the Inngest event payload. Returns `null`
	 * if no row exists yet (the user saved + the row got deleted, or some weird
	 * race) — caller can treat as no-op.
	 */
	async findByOrganizationId(organizationId: string): Promise<PricingPlaybookRow | null> {
		const row = await this.prisma.pricingPlaybook.findUnique({
			where: { organizationId },
			select: {
				id: true,
				playbookText: true,
				compiledAt: true,
				compiledHash: true,
				compileStatus: true,
				updatedAt: true,
				_count: { select: { rules: { where: { active: true } } } }
			}
		});
		if (!row) {
			return null;
		}
		return {
			id: row.id,
			playbookText: row.playbookText,
			compiledAt: row.compiledAt,
			compiledHash: row.compiledHash,
			compileStatus: row.compileStatus,
			updatedAt: row.updatedAt,
			rulesCount: row._count.rules
		};
	}

	/**
	 * Mark a compile pass complete: stamps `compiledAt = now` + records the hash
	 * that produced the current rule set. The hash check is the no-op gate: when
	 * the next compile fires on identical prose, the function checks
	 * `playbookHash === compiledHash` and skips re-running the LLM entirely.
	 */
	async markCompiled(
		pricingPlaybookId: string,
		compiledText: string,
		compiledHash: string,
		compiledAt: Date
	): Promise<void> {
		// Guard against a stale run: if the owner re-saved (playbookText changed) while this compile
		// was in flight, do NOT stamp SUCCEEDED + the now-outdated hash — that would mark the newer
		// text "verwerkt" with rules from the old text. The 0-row no-op leaves it PROCESSING for the
		// newer save's own compile to settle.
		await this.prisma.pricingPlaybook.updateMany({
			where: { id: pricingPlaybookId, playbookText: compiledText },
			data: {
				compiledAt,
				compiledHash,
				compileStatus: PrismaPricingCompileStatus.SUCCEEDED,
				compileError: null
			}
		});
	}

	/**
	 * Settle the compile status to SUCCEEDED WITHOUT bumping `compiledAt` / `compiledHash`.
	 * Used by the idempotency-skip path: a save re-triggers the compile and sets PROCESSING,
	 * but the hash already matches the last successful compile, so the LLM is skipped — we
	 * still have to flip PROCESSING back to SUCCEEDED or the UI would hang on "Bezig met
	 * verwerken" forever.
	 */
	async markCompileSucceeded(pricingPlaybookId: string, compiledText: string): Promise<void> {
		// Same stale-run guard as `markCompiled`: only settle to SUCCEEDED if the text this run saw is
		// still the current text. If the owner re-saved meanwhile, leave PROCESSING for that run.
		await this.prisma.pricingPlaybook.updateMany({
			where: { id: pricingPlaybookId, playbookText: compiledText },
			data: { compileStatus: PrismaPricingCompileStatus.SUCCEEDED, compileError: null }
		});
	}

	/** Record a failed compile (all retries exhausted). The owner sees a generic "Verwerken
	 * mislukt"; `compileError` is kept for ops/debug only. Keyed by orgId since the Inngest
	 * onFailure handler only has the original event payload. */
	async markCompileFailed(organizationId: string, compileError: string): Promise<void> {
		// Only fail a playbook that is still PROCESSING. Guards the onFailure race: an old run that
		// exhausts its retries must NOT clobber a newer save that already compiled SUCCEEDED (which
		// would flip the UI to "Verwerken mislukt" even though the current rules are valid).
		await this.prisma.pricingPlaybook.updateMany({
			where: { organizationId, compileStatus: PrismaPricingCompileStatus.PROCESSING },
			data: { compileStatus: PrismaPricingCompileStatus.FAILED, compileError }
		});
	}

	async listRules(pricingPlaybookId: string): Promise<PricingRuleRow[]> {
		const rows = await this.prisma.pricingRule.findMany({
			where: { pricingPlaybookId },
			orderBy: [{ active: 'desc' }, { priority: 'desc' }, { createdAt: 'asc' }]
		});
		return rows.map(toPricingRuleRow);
	}

	/**
	 * Apply the LLM compile output to the rule set under the given playbook.
	 *
	 * Rule preservation policy (per W11.3 spec):
	 *  1. **Hash identity** = `(ruleType, JSON.stringify(sortedCondition))`. Two rules
	 *     with the same hash describe the same logical slot — the LLM emitting an
	 *     hourly_rate-for-plumbing the second time should UPDATE the existing
	 *     hourly_rate-for-plumbing row, not create a duplicate.
	 *  2. **manualOverride=true rows are untouchable** — the LLM never overwrites
	 *     their effect/priority/description. The owner has hand-edited them; the
	 *     compile pass respects that.
	 *  3. **Disappeared rules** (existing rows whose hash doesn't match any new
	 *     LLM emission): non-manual rows get hard-deleted (LLM no longer thinks
	 *     they're in the prose, so they shouldn't exist). Manual rows get
	 *     deactivated (active=false) — they stay around as artifacts of the
	 *     owner's prior intent but don't apply at engine time.
	 *  4. **New rules** (LLM hashes with no existing match) → INSERT.
	 *
	 * One transaction so the rule-set transition is atomic from the perspective
	 * of any concurrent read.
	 */
	async applyCompileOutput(pricingPlaybookId: string, rules: ReadonlyArray<CompileRuleInput>): Promise<void> {
		await this.prisma.$transaction(async tx => {
			const existing = await tx.pricingRule.findMany({
				where: { pricingPlaybookId },
				select: {
					id: true,
					ruleType: true,
					condition: true,
					conditionNarrative: true,
					manualOverride: true
				}
			});

			const existingByHash = new Map<string, { id: string; manualOverride: boolean }>();
			for (const row of existing) {
				existingByHash.set(
					ruleIdentityHash(row.ruleType, row.condition as Record<string, unknown>, row.conditionNarrative),
					{
						id: row.id,
						manualOverride: row.manualOverride
					}
				);
			}

			const seenHashes = new Set<string>();

			for (const incoming of rules) {
				const hash = ruleIdentityHash(incoming.ruleType, incoming.condition, incoming.conditionNarrative);
				seenHashes.add(hash);
				const match = existingByHash.get(hash);
				if (match && match.manualOverride) {
					// Untouchable — leave the manual row exactly as-is.
					continue;
				}
				if (match) {
					await tx.pricingRule.update({
						where: { id: match.id },
						data: {
							ruleType: incoming.ruleType,
							condition: incoming.condition as Prisma.InputJsonValue,
							effect: incoming.effect as Prisma.InputJsonValue,
							priority: incoming.priority,
							description: incoming.description,
							conditionNarrative: incoming.conditionNarrative,
							active: true
						}
					});
				} else {
					await tx.pricingRule.create({
						data: {
							pricingPlaybookId,
							ruleType: incoming.ruleType,
							condition: incoming.condition as Prisma.InputJsonValue,
							effect: incoming.effect as Prisma.InputJsonValue,
							priority: incoming.priority,
							description: incoming.description,
							conditionNarrative: incoming.conditionNarrative
						}
					});
				}
			}

			// Sweep — rows the LLM didn't emit this round.
			const orphanedIds: string[] = [];
			const deactivateIds: string[] = [];
			for (const [hash, row] of existingByHash.entries()) {
				if (seenHashes.has(hash)) {
					continue;
				}
				if (row.manualOverride) {
					deactivateIds.push(row.id);
				} else {
					orphanedIds.push(row.id);
				}
			}
			if (orphanedIds.length > 0) {
				await tx.pricingRule.deleteMany({ where: { id: { in: orphanedIds } } });
			}
			if (deactivateIds.length > 0) {
				await tx.pricingRule.updateMany({
					where: { id: { in: deactivateIds } },
					data: { active: false }
				});
			}
		});
	}

	async findRuleByIdInPlaybook(pricingPlaybookId: string, ruleId: string): Promise<PricingRuleRow | null> {
		const row = await this.prisma.pricingRule.findFirst({
			where: { id: ruleId, pricingPlaybookId }
		});
		return row ? toPricingRuleRow(row) : null;
	}

	/**
	 * Update an existing rule. Flips `manualOverride: true` permanently so the
	 * next compile pass leaves this row alone. Only fields the UI exposes are
	 * patchable — `pricingPlaybookId` + `ruleType` stay frozen.
	 */
	async updateRule(
		ruleId: string,
		patch: {
			condition?: Record<string, unknown>;
			effect?: Record<string, unknown>;
			priority?: number;
			active?: boolean;
			description?: string;
			conditionNarrative?: string | null;
		}
	): Promise<PricingRuleRow> {
		// Prisma's JSON types are stricter than `Record<string, unknown>` (they
		// recursively require InputJsonValue leaves). Cast at the boundary — the
		// DB CHECK constraint enforces shape, and the wire validators caught any
		// non-JSON-serializable values before we got here.
		const data: Prisma.PricingRuleUpdateInput = {
			manualOverride: true,
			...(patch.condition !== undefined ? { condition: patch.condition as Prisma.InputJsonValue } : {}),
			...(patch.effect !== undefined ? { effect: patch.effect as Prisma.InputJsonValue } : {}),
			...(patch.priority !== undefined ? { priority: patch.priority } : {}),
			...(patch.active !== undefined ? { active: patch.active } : {}),
			...(patch.description !== undefined ? { description: patch.description } : {}),
			...(patch.conditionNarrative !== undefined ? { conditionNarrative: patch.conditionNarrative } : {})
		};
		const row = await this.prisma.pricingRule.update({ where: { id: ruleId }, data });
		return toPricingRuleRow(row);
	}

	async deleteRule(ruleId: string): Promise<void> {
		await this.prisma.pricingRule.delete({ where: { id: ruleId } });
	}
}

/**
 * Identity hash for the compile-pass upsert. Sorted-key JSON so `{a:1, b:2}` and
 * `{b:2, a:1}` produce the same hash — the LLM emits unordered objects and we
 * don't want hash drift to create duplicates.
 */
function ruleIdentityHash(
	ruleType: PrismaPricingRuleType,
	condition: Record<string, unknown>,
	conditionNarrative: string | null
): string {
	const sortedKeys = Object.keys(condition).sort();
	const sortedCondition: Record<string, unknown> = {};
	for (const key of sortedKeys) {
		sortedCondition[key] = condition[key];
	}
	// Two narrative-gated rules with the same structured condition but different
	// narratives (e.g. "discount for orders >€5k" vs. "discount for long-time
	// customers" — both `{ ruleType: discount, condition: {} }`) are distinct
	// logical slots; including the narrative in the hash keeps them separate.
	return `${ruleType}|${JSON.stringify(sortedCondition)}|${conditionNarrative ?? ''}`;
}

function toPricingRuleRow(row: {
	id: string;
	pricingPlaybookId: string;
	ruleType: PrismaPricingRuleType;
	condition: unknown;
	effect: unknown;
	priority: number;
	active: boolean;
	description: string;
	conditionNarrative: string | null;
	manualOverride: boolean;
	createdAt: Date;
	updatedAt: Date;
}): PricingRuleRow {
	return {
		id: row.id,
		pricingPlaybookId: row.pricingPlaybookId,
		ruleType: row.ruleType,
		condition: row.condition as Record<string, unknown>,
		effect: row.effect as Record<string, unknown>,
		priority: row.priority,
		active: row.active,
		description: row.description,
		conditionNarrative: row.conditionNarrative,
		manualOverride: row.manualOverride,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}
