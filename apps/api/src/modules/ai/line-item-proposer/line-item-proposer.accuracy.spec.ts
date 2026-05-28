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
					return {
						fixture,
						returnedRefs,
						matchedRefs,
						hit: matchedRefs.length > 0,
						error: null as string | null
					};
				} catch (error) {
					return {
						fixture,
						returnedRefs: [] as string[],
						matchedRefs: [] as string[],
						hit: false,
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
			if (result.error) {
				console.log(`     error: ${result.error}`);
			}
		}
		console.log(`\n  Hits: ${hits}/${results.length} (threshold ${MIN_HITS})\n`);

		expect(hits).toBeGreaterThanOrEqual(MIN_HITS);
	});
});

if (!hasApiKey) {
	console.log('\n[line-item-proposer.accuracy.spec] OPENAI_API_KEY not set — skipping live accuracy test.\n');
}
