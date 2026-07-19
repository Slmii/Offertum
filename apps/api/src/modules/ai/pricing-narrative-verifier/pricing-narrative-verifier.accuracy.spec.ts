import { validateEnv } from '@/config/env.schema';
import { AI_CLIENT } from '@/modules/ai/clients/ai-client.interface';
import { OpenAIClient } from '@/modules/ai/clients/openai-client.service';
import { appendAiReportEntry } from '@/modules/ai/__test-utils/ai-report-writer';
import {
	MIN_NARRATIVE_ACCURACY,
	NL_NARRATIVE_FIXTURES
} from '@/modules/ai/pricing-narrative-verifier/fixtures/nl-narrative-expected.fixtures';
import { PricingNarrativeVerifierService } from '@/modules/ai/pricing-narrative-verifier/pricing-narrative-verifier.service';
import { AICallLogger } from '@/modules/ai/logging/ai-call-logger.service';
import { LogService } from '@/modules/logger/log.service';
import { describe, expect, it, jest } from '@jest/globals';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

/**
 * Live-API accuracy harness for the quote-time narrative verifier ("AI controleert").
 *
 * Runs against the real OpenAI API; ~€0.03 per run (6 fixtures). Skipped automatically when
 * `OPENAI_API_KEY` isn't set. Run via `pnpm test:ai` and open `.ai-reports/index.html` to see
 * each request + narrative + expected-vs-actual verdict + the model's reason.
 *
 * Grading is verdict-level: for each rule we compare the model's `applies` to the expected verdict.
 * A rule with a duplicate/missing verdict resolves to `null` (unconfirmed) — matching the
 * fail-closed behaviour of `resolveConfirmedNarrativeRuleIds` in production.
 */

const hasApiKey = !!process.env.OPENAI_API_KEY;
const describeIfKey = hasApiKey ? describe : describe.skip;

describeIfKey('PricingNarrativeVerifierService — live OpenAI accuracy', () => {
	jest.setTimeout(300_000);

	it(`hits ≥${(MIN_NARRATIVE_ACCURACY * 100).toFixed(0)}% verdict accuracy on the Dutch narrative corpus`, async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true })],
			providers: [
				OpenAIClient,
				{ provide: AI_CLIENT, useExisting: OpenAIClient },
				PricingNarrativeVerifierService,
				{ provide: AICallLogger, useValue: { record: () => Promise.resolve(null) } },
				{ provide: LogService, useValue: { logAction: () => undefined } }
			]
		}).compile();

		const verifier = moduleRef.get(PricingNarrativeVerifierService);

		const CONCURRENCY = 2;
		const runs: Array<{
			fixture: (typeof NL_NARRATIVE_FIXTURES)[number];
			verdicts: Array<{ ref: string; applies: boolean; reason: string }> | null;
			error: string | null;
		}> = [];
		for (let i = 0; i < NL_NARRATIVE_FIXTURES.length; i += CONCURRENCY) {
			const slice = NL_NARRATIVE_FIXTURES.slice(i, i + CONCURRENCY);
			const chunk = await Promise.all(
				slice.map(async fixture => {
					try {
						const { value } = await verifier.verify({ context: fixture.context, rules: fixture.rules });
						return { fixture, verdicts: value.verdicts, error: null as string | null };
					} catch (error) {
						return {
							fixture,
							verdicts: null,
							error: error instanceof Error ? error.message : String(error)
						};
					}
				})
			);
			runs.push(...chunk);
		}

		let correct = 0;
		let total = 0;
		let fixturesPassed = 0;
		const fixturePayloads: Array<Record<string, unknown>> = [];

		console.log(`\n${'─'.repeat(80)}\nNarrative-verifier accuracy — per-fixture results\n${'─'.repeat(80)}`);

		for (const run of runs) {
			// One verdict per ref, fail-closed: duplicate/missing/unknown → null (unconfirmed).
			const actualByRef = resolveActuals(run.verdicts ?? []);
			const reasonByRef = new Map((run.verdicts ?? []).map(v => [v.ref, v.reason] as const));

			const ruleResults = run.fixture.rules.map(rule => {
				const expected = run.fixture.expected[rule.ref] ?? false;
				const actual = run.error ? null : (actualByRef.get(rule.ref) ?? null);
				const ok = actual === expected;
				total += 1;
				if (ok) {
					correct += 1;
				}
				return {
					ref: rule.ref,
					narrative: rule.narrative,
					expected,
					actual,
					ok,
					reason: reasonByRef.get(rule.ref) ?? null
				};
			});

			const acceptable = !run.error && ruleResults.every(r => r.ok);
			if (acceptable) {
				fixturesPassed += 1;
			}
			console.log(
				`${acceptable ? '✅' : '❌'} "${run.fixture.name}" — ${ruleResults.filter(r => r.ok).length}/${ruleResults.length} verdicts correct${
					run.error ? ` (error: ${run.error})` : ''
				}`
			);

			fixturePayloads.push({
				name: run.fixture.name,
				acceptable,
				error: run.error,
				context: {
					requestType: run.fixture.context.requestType,
					bodyText: run.fixture.context.bodyText,
					customerName: run.fixture.context.customerName,
					customerEmail: run.fixture.context.customerEmail
				},
				rules: ruleResults
			});
		}

		const accuracy = total === 0 ? 0 : correct / total;
		console.log(
			`\n  Overall: ${(accuracy * 100).toFixed(1)}% (${correct}/${total} verdicts · ${fixturesPassed}/${runs.length} fixtures)\n`
		);

		appendAiReportEntry({
			kind: 'narrative-verify',
			summary: { overall: accuracy, correct, total, fixturesPassed, fixturesTotal: runs.length },
			fixtures: fixturePayloads
		});

		expect(accuracy).toBeGreaterThanOrEqual(MIN_NARRATIVE_ACCURACY);
	});
});

if (!hasApiKey) {
	console.log('\n[pricing-narrative-verifier.accuracy.spec] OPENAI_API_KEY not set — skipping live accuracy test.\n');
}

/** Map ref → applies, keeping only refs with exactly one verdict (fail-closed on dupes). */
function resolveActuals(verdicts: Array<{ ref: string; applies: boolean }>): Map<string, boolean> {
	const byRef = new Map<string, boolean[]>();
	for (const v of verdicts) {
		const arr = byRef.get(v.ref) ?? [];
		arr.push(v.applies);
		byRef.set(v.ref, arr);
	}
	const result = new Map<string, boolean>();
	for (const [ref, applies] of byRef) {
		if (applies.length === 1) {
			result.set(ref, applies[0] === true);
		}
	}
	return result;
}
