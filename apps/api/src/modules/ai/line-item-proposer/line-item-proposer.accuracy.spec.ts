import { validateEnv } from '@/config/env.schema';
import { AI_CLIENT } from '@/modules/ai/clients/ai-client.interface';
import { OpenAIClient } from '@/modules/ai/clients/openai-client.service';
import { NL_LINE_ITEM_PROPOSER_FIXTURES } from '@/modules/ai/line-item-proposer/fixtures/nl-line-item-proposals.fixtures';
import { LineItemProposerService } from '@/modules/ai/line-item-proposer/line-item-proposer.service';
import { AICallLogger } from '@/modules/ai/logging/ai-call-logger.service';
import { LogService } from '@/modules/logger/log.service';
import { describe, expect, it, jest } from '@jest/globals';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

/**
 * Live-API accuracy harness for the Dutch line-item proposer (W10.1).
 *
 * **Runs against the real OpenAI API.** This is the prompt-iteration harness: change
 * `prompts/nl.ts`, run this, see whether catalog-match accuracy improved. It is NOT a
 * unit test of the resolver (that's `quote-line-items.resolver.spec.ts`, pure + offline).
 *
 * **Skipped automatically when `OPENAI_API_KEY` isn't set** so CI without a key + fresh
 * checkouts don't see false failures. Run manually via
 * `pnpm exec jest line-item-proposer.accuracy` once your key is in `.env`.
 *
 * Acceptance criterion (W10.1): on a 10-fixture corpus, ≥7 fixtures must yield at least
 * one correct catalog match (a ref from the fixture's `expectedCatalogRefs`). We score on
 * "≥1 correct match" rather than exact-set because a quote can legitimately include extra
 * or fewer lines — what we're guarding is that the model reliably finds the obviously-
 * relevant catalog item, not that it reproduces a golden line set.
 */

const hasApiKey = !!process.env.OPENAI_API_KEY;
const describeIfKey = hasApiKey ? describe : describe.skip;

// At least 7 of 10 fixtures must produce ≥1 correct catalog match.
const MIN_HITS = 7;

/**
 * Category-tagging grade for an inferred line. Lenient by design: a `null`/omitted tag is
 * always fine (a miss isn't a mispricing), and inflections/synonyms are tolerated via a
 * substring test (`garden` ↔ `gardening`). Only a genuinely DIFFERENT trade is a mismatch —
 * that's the case that would attach the WRONG category-scoped hourly rate.
 */
function isCategoryTagAcceptable(expected: string | null, emitted: string | null): boolean {
	if (emitted === null || expected === null) {
		return true;
	}
	const a = expected.trim().toLowerCase();
	const b = emitted.trim().toLowerCase();
	return a === b || a.includes(b) || b.includes(a);
}

describeIfKey('LineItemProposerService — live OpenAI accuracy', () => {
	jest.setTimeout(120_000);

	it(`matches ≥1 expected catalog item on ≥${MIN_HITS}/${NL_LINE_ITEM_PROPOSER_FIXTURES.length} fixtures`, async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [
				ConfigModule.forRoot({
					isGlobal: true,
					validate: validateEnv,
					cache: true
				})
			],
			providers: [
				OpenAIClient,
				{ provide: AI_CLIENT, useExisting: OpenAIClient },
				LineItemProposerService,
				{ provide: AICallLogger, useValue: { record: () => Promise.resolve(null) } },
				{ provide: LogService, useValue: { logAction: () => undefined } }
			]
		}).compile();

		const proposer = moduleRef.get(LineItemProposerService);

		const results = await Promise.all(
			NL_LINE_ITEM_PROPOSER_FIXTURES.map(async fixture => {
				try {
					const { value } = await proposer.propose(fixture.input);
					const returnedRefs = value.catalogLines.map(line => line.ref);
					const matchedRefs = returnedRefs.filter(ref => fixture.expectedCatalogRefs.includes(ref));
					const inferredCategories = value.inferredLines.map(line => line.category);
					const miscategorized = value.inferredLines
						.filter(line => !isCategoryTagAcceptable(fixture.expectedInferredCategory, line.category))
						.map(line => `${line.description} → ${line.category ?? 'null'}`);
					return {
						fixture,
						returnedRefs,
						matchedRefs,
						hit: matchedRefs.length > 0,
						inferredCategories,
						miscategorized,
						error: null as string | null
					};
				} catch (error) {
					return {
						fixture,
						returnedRefs: [] as string[],
						matchedRefs: [] as string[],
						hit: false,
						inferredCategories: [] as (string | null)[],
						miscategorized: [] as string[],
						error: error instanceof Error ? error.message : String(error)
					};
				}
			})
		);

		const hits = results.filter(result => result.hit).length;

		console.log(`\n${'─'.repeat(80)}`);
		console.log('Line-item proposer accuracy — per-fixture results');
		console.log('─'.repeat(80));
		for (const result of results) {
			const mark = result.hit ? '✅' : '❌';
			console.log(`${mark} [${result.fixture.category.padEnd(11)}] "${result.fixture.input.requestType}"`);
			console.log(
				`     expected one of=[${result.fixture.expectedCatalogRefs.join(', ')}]  returned=[${result.returnedRefs.join(', ')}]`
			);
			const catMark = result.miscategorized.length === 0 ? '✅' : '⚠️';
			console.log(
				`     ${catMark} category expected=${result.fixture.expectedInferredCategory ?? 'null'}  inferred tags=[${result.inferredCategories.map(c => c ?? 'null').join(', ')}]`
			);
			for (const bad of result.miscategorized) {
				console.log(`        ✗ wrong-trade tag: ${bad}`);
			}
			if (result.error) {
				console.log(`     error: ${result.error}`);
			}
		}
		console.log(`\n  Hits: ${hits}/${results.length} (threshold ${MIN_HITS})`);

		const miscategorizedTotal = results.reduce((sum, result) => sum + result.miscategorized.length, 0);
		console.log(`  Wrong-trade category tags: ${miscategorizedTotal} (must be 0)\n`);

		expect(hits).toBeGreaterThanOrEqual(MIN_HITS);
		// A wrong-trade tag would apply a different category's hourly rate — a mispricing, not a miss.
		// Null/omitted tags are tolerated (see isCategoryTagAcceptable), so this only catches real mis-tags.
		expect(miscategorizedTotal).toBe(0);
	});
});

if (!hasApiKey) {
	console.log('\n[line-item-proposer.accuracy.spec] OPENAI_API_KEY not set — skipping live accuracy test.\n');
}
