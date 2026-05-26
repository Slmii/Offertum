import type { Prisma } from '@/generated/prisma/client';
import { PricingRuleType as PrismaPricingRuleType } from '@/generated/prisma/enums';
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
	sourceSpan: { start: number; end: number } | null;
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
	sourceSpan: { start: number; end: number } | null;
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
				updatedAt: true,
				_count: { select: { rules: { where: { active: true } } } }
			}
		});
		return {
			id: row.id,
			playbookText: row.playbookText,
			compiledAt: row.compiledAt,
			compiledHash: row.compiledHash,
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
			update: { playbookText },
			create: { organizationId, playbookText },
			select: {
				id: true,
				playbookText: true,
				compiledAt: true,
				compiledHash: true,
				updatedAt: true,
				_count: { select: { rules: { where: { active: true } } } }
			}
		});
		return {
			id: row.id,
			playbookText: row.playbookText,
			compiledAt: row.compiledAt,
			compiledHash: row.compiledHash,
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
				updatedAt: true,
				_count: { select: { rules: { where: { active: true } } } }
			}
		});
		if (!row) {return null;}
		return {
			id: row.id,
			playbookText: row.playbookText,
			compiledAt: row.compiledAt,
			compiledHash: row.compiledHash,
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
	async markCompiled(pricingPlaybookId: string, compiledHash: string, compiledAt: Date): Promise<void> {
		await this.prisma.pricingPlaybook.update({
			where: { id: pricingPlaybookId },
			data: { compiledAt, compiledHash }
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
					manualOverride: true
				}
			});

			const existingByHash = new Map<string, { id: string; manualOverride: boolean }>();
			for (const row of existing) {
				existingByHash.set(ruleIdentityHash(row.ruleType, row.condition as Record<string, unknown>), {
					id: row.id,
					manualOverride: row.manualOverride
				});
			}

			const seenHashes = new Set<string>();

			for (const incoming of rules) {
				const hash = ruleIdentityHash(incoming.ruleType, incoming.condition);
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
							sourceSpan: incoming.sourceSpan ?? undefined,
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
							sourceSpan: incoming.sourceSpan ?? undefined
						}
					});
				}
			}

			// Sweep — rows the LLM didn't emit this round.
			const orphanedIds: string[] = [];
			const deactivateIds: string[] = [];
			for (const [hash, row] of existingByHash.entries()) {
				if (seenHashes.has(hash)) {continue;}
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
	 * patchable — `pricingPlaybookId`, `ruleType`, `sourceSpan` stay frozen.
	 */
	async updateRule(
		ruleId: string,
		patch: {
			condition?: Record<string, unknown>;
			effect?: Record<string, unknown>;
			priority?: number;
			active?: boolean;
			description?: string;
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
			...(patch.description !== undefined ? { description: patch.description } : {})
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
function ruleIdentityHash(ruleType: PrismaPricingRuleType, condition: Record<string, unknown>): string {
	const sortedKeys = Object.keys(condition).sort();
	const sortedCondition: Record<string, unknown> = {};
	for (const key of sortedKeys) {
		sortedCondition[key] = condition[key];
	}
	return `${ruleType}|${JSON.stringify(sortedCondition)}`;
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
	sourceSpan: unknown;
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
		sourceSpan: isValidSpan(row.sourceSpan) ? row.sourceSpan : null,
		manualOverride: row.manualOverride,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function isValidSpan(value: unknown): value is { start: number; end: number } {
	if (typeof value !== 'object' || value === null) {return false;}
	const candidate = value as { start?: unknown; end?: unknown };
	return typeof candidate.start === 'number' && typeof candidate.end === 'number';
}
