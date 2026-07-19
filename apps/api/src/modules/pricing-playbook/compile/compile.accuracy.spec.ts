import { validateEnv } from '@/config/env.schema';
import { AI_CLIENT } from '@/modules/ai/clients/ai-client.interface';
import { OpenAIClient } from '@/modules/ai/clients/openai-client.service';
import { AICallLogger } from '@/modules/ai/logging/ai-call-logger.service';
import { appendAiReportEntry } from '@/modules/ai/__test-utils/ai-report-writer';
import { PricingPlaybookCompileService } from '@/modules/pricing-playbook/compile/compile.service';
import type { PricingRuleCompileOutput } from '@/modules/pricing-playbook/compile/compile.types';
import {
	MIN_COMPILE_ACCURACY,
	MIN_RULE_MATCH_RATIO,
	NL_COMPILE_FIXTURES,
	type ExpectedCompileRule
} from '@/modules/pricing-playbook/compile/fixtures/nl-compile-expected.fixtures';
import { LogService } from '@/modules/logger/log.service';
import { describe, expect, it, jest } from '@jest/globals';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

/**
 * Live-API accuracy harness for the pricing-playbook compile pass (prose → typed rules).
 *
 * Runs against the real OpenAI API; ~€0.12 per run (15 fixtures). Skipped automatically when
 * `OPENAI_API_KEY` isn't set, so plain `pnpm test` never burns credit. Run it via
 * `pnpm test:ai` and open `.ai-reports/index.html` to eyeball each prose → rules diff.
 *
 * **Grading is coarse.** Per expected rule we look for a produced rule with the same
 * `ruleType` + effect type + value (±0.01), the right narrative-vs-structured split
 * (`conditionNarrative` non-null iff the qualifier can't be a structured field), and — where the
 * prose is unambiguous — the right `urgency` tier. A fixture passes at ≥70% of its expected
 * rules matched (the no-rules fixture passes iff the compiler emits zero rules). The report's
 * per-rule table is the real payload; the gate just catches gross regressions.
 */

const hasApiKey = !!process.env.OPENAI_API_KEY;
const describeIfKey = hasApiKey ? describe : describe.skip;

describeIfKey('PricingPlaybookCompileService — live OpenAI accuracy', () => {
	jest.setTimeout(300_000);

	it(`hits ≥${(MIN_COMPILE_ACCURACY * 100).toFixed(0)}% fixture pass rate on the Dutch compile corpus`, async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true })],
			providers: [
				OpenAIClient,
				{ provide: AI_CLIENT, useExisting: OpenAIClient },
				PricingPlaybookCompileService,
				{ provide: AICallLogger, useValue: { record: () => Promise.resolve(null) } },
				{ provide: LogService, useValue: { logAction: () => undefined } }
			]
		}).compile();

		const compileService = moduleRef.get(PricingPlaybookCompileService);

		// Concurrency-limit like the sibling harnesses so gpt-4o's TPM bucket doesn't lose a retry race.
		const CONCURRENCY = 2;
		const runs: Array<{
			fixture: (typeof NL_COMPILE_FIXTURES)[number];
			rules: PricingRuleCompileOutput[] | null;
			error: string | null;
		}> = [];
		for (let i = 0; i < NL_COMPILE_FIXTURES.length; i += CONCURRENCY) {
			const slice = NL_COMPILE_FIXTURES.slice(i, i + CONCURRENCY);
			const chunk = await Promise.all(
				slice.map(async fixture => {
					try {
						const { value } = await compileService.compile(fixture.prose);
						return { fixture, rules: value.rules, error: null as string | null };
					} catch (error) {
						return { fixture, rules: null, error: error instanceof Error ? error.message : String(error) };
					}
				})
			);
			runs.push(...chunk);
		}

		let passed = 0;
		const fixturePayloads: Array<Record<string, unknown>> = [];

		console.log(`\n${'─'.repeat(80)}\nCompile accuracy — per-fixture results\n${'─'.repeat(80)}`);

		for (const run of runs) {
			const produced = run.rules ?? [];
			const grade = gradeCompile(run.fixture.expected, produced);
			const acceptable = run.error
				? false
				: run.fixture.expected.length === 0
					? produced.length === 0
					: grade.matchedCount / run.fixture.expected.length >= MIN_RULE_MATCH_RATIO;
			if (acceptable) {
				passed += 1;
			}
			console.log(
				`${acceptable ? '✅' : '❌'} "${run.fixture.name}" — ${grade.matchedCount}/${run.fixture.expected.length} expected rules matched${
					run.error ? ` (error: ${run.error})` : ''
				}`
			);

			fixturePayloads.push({
				name: run.fixture.name,
				acceptable,
				error: run.error,
				matchedCount: grade.matchedCount,
				expectedCount: run.fixture.expected.length,
				prose: run.fixture.prose,
				expected: grade.expected,
				produced: produced.map(rule => ({
					ruleType: rule.ruleType,
					effectType: rule.effect.type,
					value: rule.effect.value,
					conditionNarrative: rule.conditionNarrative,
					urgency: rule.condition.urgency,
					jurisdiction: rule.condition.jurisdiction,
					category: rule.condition.category,
					lineKind: rule.condition.lineKind,
					description: rule.description
				}))
			});
		}

		const accuracy = passed / runs.length;
		console.log(`\n  Overall: ${(accuracy * 100).toFixed(1)}% (${passed}/${runs.length} fixtures passed)\n`);

		appendAiReportEntry({
			kind: 'compile',
			summary: { overall: accuracy, passed, total: runs.length },
			fixtures: fixturePayloads
		});

		expect(accuracy).toBeGreaterThanOrEqual(MIN_COMPILE_ACCURACY);
	});
});

if (!hasApiKey) {
	console.log('\n[compile.accuracy.spec] OPENAI_API_KEY not set — skipping live accuracy test.\n');
}

// ─── Grading ──────────────────────────────────────────────────────────────────────

interface CompileGrade {
	matchedCount: number;
	expected: Array<ExpectedCompileRule & { matched: boolean }>;
}

/** Greedy one-to-one match: each produced rule can satisfy at most one expected rule. */
function gradeCompile(expected: ExpectedCompileRule[], produced: PricingRuleCompileOutput[]): CompileGrade {
	const usedProduced = new Set<number>();
	const graded = expected.map(exp => {
		const idx = produced.findIndex(
			(rule, i) => !usedProduced.has(i) && matchesExpected(rule, exp)
		);
		if (idx >= 0) {
			usedProduced.add(idx);
		}
		return { ...exp, matched: idx >= 0 };
	});
	return { matchedCount: graded.filter(g => g.matched).length, expected: graded };
}

function matchesExpected(rule: PricingRuleCompileOutput, exp: ExpectedCompileRule): boolean {
	if (rule.ruleType !== exp.ruleType || rule.effect.type !== exp.effectType) {
		return false;
	}
	if (Math.abs(rule.effect.value - exp.value) > 0.01) {
		return false;
	}
	if (exp.hasNarrative !== undefined && (rule.conditionNarrative !== null) !== exp.hasNarrative) {
		return false;
	}
	if (exp.urgency !== undefined && rule.condition.urgency !== exp.urgency) {
		return false;
	}
	return true;
}
