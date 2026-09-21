import { validateEnv } from '@/config/env.schema';
import { formatAttachmentBlocks, isAttachmentRescueCandidate } from '@/lib/attachments/attachment-prompt-text';
import { AttachmentTextExtractor, type AttachmentTextResult } from '@/lib/attachments/attachment-text-extractor';
import { appendAiReportEntry } from '@/modules/ai/__test-utils/ai-report-writer';
import { dateMatch, fuzzyMatch, hintsMatch } from '@/modules/ai/__test-utils/extraction-grading';
import { ClassifierService } from '@/modules/ai/classifier/classifier.service';
import type { ClassifierInput } from '@/modules/ai/classifier/classifier.types';
import { AI_CLIENT } from '@/modules/ai/clients/ai-client.interface';
import { OpenAIClient } from '@/modules/ai/clients/openai-client.service';
import { ExtractorService } from '@/modules/ai/extractor/extractor.service';
import type { ExtractorResult } from '@/modules/ai/extractor/extractor.types';
import { AICallLogger } from '@/modules/ai/logging/ai-call-logger.service';
import {
	ATTACHMENT_FLOW_REFERENCE_DATE_ISO,
	MIN_ATTACHMENT_FIXTURE_PASS_RATE,
	NL_ATTACHMENT_FLOW_FIXTURES,
	type AttachmentFlowFixture
} from '@/modules/inbound-attachments/fixtures/nl-attachment-flow.fixtures';
import { LogService } from '@/modules/logger/log.service';
import { describe, expect, it, jest } from '@jest/globals';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Attachment flow, end to end: real document on disk → real parser → real classifier +
 * extractor. Run on its own with `pnpm test:ai:attachments`.
 *
 * Two stages, because they cost different things:
 *
 *  1. PARSE — offline, deterministic, free. Runs in every `pnpm test`. Proves each fixture
 *     document is read the way the fixtures claim (status + key substrings), so a parser or
 *     library regression is caught without spending a cent.
 *  2. LIVE AI — skipped without OPENAI_API_KEY (jest does not load .env; the `test:ai:*`
 *     launcher does). Drives the SAME pure helpers the production pipeline uses for the rescue
 *     rule and the prompt text (`attachment-prompt-text.ts`), so this cannot keep passing while
 *     the pipeline drifts. ~20 model calls, a few euro cents.
 *
 * What is NOT covered here: fetching bytes from Gmail/Graph and the DB rows — those are unit
 * tested in `inbound-attachments.service.spec.ts` with fakes, and by hand via TEST_CASES ATT-*.
 */

const FILES_DIR = join(__dirname, 'fixtures', 'files');
const extractor = new AttachmentTextExtractor();

async function parseFiles(
	fixture: AttachmentFlowFixture
): Promise<Array<{ file: string; result: AttachmentTextResult }>> {
	const parsed: Array<{ file: string; result: AttachmentTextResult }> = [];
	for (const { file, mimeType } of fixture.files) {
		const result = await extractor.extract({
			filename: file,
			mimeType,
			bytes: readFileSync(join(FILES_DIR, file))
		});
		parsed.push({ file, result });
	}
	return parsed;
}

describe('Attachment flow — parse stage (offline)', () => {
	it.each(NL_ATTACHMENT_FLOW_FIXTURES.map(f => [f.name, f] as const))('%s', async (_name, fixture) => {
		const parsed = await parseFiles(fixture);

		for (const expectedFile of fixture.files) {
			const actual = parsed.find(p => p.file === expectedFile.file)!.result;
			expect({ file: expectedFile.file, status: actual.status }).toEqual({
				file: expectedFile.file,
				status: expectedFile.expectedStatus
			});
			for (const needle of expectedFile.mustContain ?? []) {
				expect(actual.text).toContain(needle);
			}
		}
	});
});

interface Check {
	label: string;
	expected: unknown;
	actual: unknown;
	ok: boolean;
	/** Hard checks fail the fixture outright; one soft (extraction) miss is tolerated. */
	isHard: boolean;
}

const hasApiKey = !!process.env.OPENAI_API_KEY;
const describeIfKey = hasApiKey ? describe : describe.skip;

describeIfKey('Attachment flow — live OpenAI accuracy', () => {
	jest.setTimeout(240_000);

	it(`≥${(MIN_ATTACHMENT_FIXTURE_PASS_RATE * 100).toFixed(0)}% of attachment fixtures classify + extract correctly`, async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true })],
			providers: [
				OpenAIClient,
				{ provide: AI_CLIENT, useExisting: OpenAIClient },
				ClassifierService,
				ExtractorService,
				{ provide: AICallLogger, useValue: { record: () => Promise.resolve(null) } },
				{ provide: LogService, useValue: { logAction: () => undefined } }
			]
		}).compile();
		const classifier = moduleRef.get(ClassifierService);
		const fieldExtractor = moduleRef.get(ExtractorService);

		const runFixture = async (fixture: AttachmentFlowFixture) => {
			const checks: Check[] = [];
			try {
				// ── parse ──
				const parsed = await parseFiles(fixture);
				for (const expectedFile of fixture.files) {
					const actual = parsed.find(p => p.file === expectedFile.file)!.result;
					checks.push({
						label: `parse ${expectedFile.file}`,
						expected: expectedFile.expectedStatus,
						actual: actual.status,
						ok: actual.status === expectedFile.expectedStatus,
						isHard: true
					});
				}

				// ── classify, exactly as `OpportunitiesService.classifyWithAttachments` does ──
				const attachments = fixture.files.map(f => ({ filename: f.file, mimeType: f.mimeType }));
				const withFilenames: ClassifierInput = { ...fixture.email, attachments };
				const first = (await classifier.classify(withFilenames)).value;

				const attachmentText = formatAttachmentBlocks(
					parsed.map(p => ({ filename: p.file, text: p.result.text }))
				);
				const isRescueCandidate = isAttachmentRescueCandidate({
					isQuote: first.isQuote,
					bodyLength: fixture.email.bodyText.length,
					attachments
				});

				let final = first;
				let wasRescued = false;
				if (isRescueCandidate && attachmentText) {
					final = (await classifier.classify({ ...withFilenames, attachmentText })).value;
					wasRescued = final.isQuote;
				}
				checks.push({
					label: 'isQuote',
					expected: fixture.expected.isQuote,
					actual: final.isQuote,
					ok: final.isQuote === fixture.expected.isQuote,
					isHard: true
				});

				// ── extract ──
				let extraction: ExtractorResult | null = null;
				if (final.isQuote && fixture.expected.isQuote) {
					extraction = (
						await fieldExtractor.extract(
							{ ...fixture.email, attachments, attachmentText },
							ATTACHMENT_FLOW_REFERENCE_DATE_ISO
						)
					).value;
					checks.push(...gradeExtraction(extraction, fixture));
				}

				const hardOk = checks.filter(c => c.isHard).every(c => c.ok);
				const softMisses = checks.filter(c => !c.isHard && !c.ok).length;
				return {
					fixture,
					checks,
					acceptable: hardOk && softMisses <= 1,
					firstVerdict: first,
					finalVerdict: final,
					isRescueCandidate,
					wasRescued,
					attachmentText,
					extraction,
					error: null as string | null
				};
			} catch (error) {
				return {
					fixture,
					checks,
					acceptable: false,
					firstVerdict: null,
					finalVerdict: null,
					isRescueCandidate: false,
					wasRescued: false,
					attachmentText: null,
					extraction: null,
					error: error instanceof Error ? error.message : String(error)
				};
			}
		};

		// Same TPM reasoning as the extractor harness: batch so in-flight tokens stay bounded.
		const CONCURRENCY = 3;
		const results: Array<Awaited<ReturnType<typeof runFixture>>> = [];
		for (let i = 0; i < NL_ATTACHMENT_FLOW_FIXTURES.length; i += CONCURRENCY) {
			results.push(...(await Promise.all(NL_ATTACHMENT_FLOW_FIXTURES.slice(i, i + CONCURRENCY).map(runFixture))));
		}

		console.log(`\n${'─'.repeat(80)}\nAttachment flow — per-fixture results\n${'─'.repeat(80)}`);
		for (const r of results) {
			const misses = r.checks.filter(c => !c.ok);
			const rescue = r.isRescueCandidate
				? r.wasRescued
					? ' [rescued by attachment text]'
					: ' [rescue attempted, stayed negative]'
				: '';
			console.log(`${r.acceptable ? '✅' : '❌'} ${r.fixture.name}${rescue}`);
			if (r.error) {
				console.log(`     error: ${r.error}`);
			}
			for (const c of misses) {
				console.log(
					`     ✗ ${c.label}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)}`
				);
			}
		}

		const passed = results.filter(r => r.acceptable).length;
		const rate = passed / results.length;
		console.log(
			`${'─'.repeat(80)}\n${passed}/${results.length} fixtures acceptable (${(rate * 100).toFixed(1)}%)\n`
		);

		appendAiReportEntry({
			kind: 'attachments',
			summary: {
				overall: rate,
				fixturesPassed: passed,
				fixturesTotal: results.length,
				rescued: results.filter(r => r.wasRescued).length
			},
			fixtures: results.map(r => ({
				name: r.fixture.name,
				notes: r.fixture.notes,
				email: r.fixture.email,
				files: r.fixture.files.map(f => f.file),
				acceptable: r.acceptable,
				error: r.error,
				isRescueCandidate: r.isRescueCandidate,
				wasRescued: r.wasRescued,
				firstVerdict: r.firstVerdict,
				finalVerdict: r.finalVerdict,
				attachmentText: r.attachmentText,
				extraction: r.extraction,
				checks: r.checks
			}))
		});

		expect(rate).toBeGreaterThanOrEqual(MIN_ATTACHMENT_FIXTURE_PASS_RATE);
	});
});

function gradeExtraction(actual: ExtractorResult, fixture: AttachmentFlowFixture): Check[] {
	const expected = fixture.expected.extraction ?? {};
	const checks: Check[] = [];

	if (expected.requestType !== undefined) {
		checks.push(
			soft(
				'requestType',
				expected.requestType,
				actual.requestType,
				fuzzyMatch(actual.requestType, expected.requestType)
			)
		);
	}
	if (expected.address !== undefined) {
		checks.push(soft('address', expected.address, actual.address, fuzzyMatch(actual.address, expected.address)));
	}
	if (expected.customerDeadline !== undefined) {
		checks.push(
			hard(
				'customerDeadline',
				expected.customerDeadline,
				actual.customerDeadline,
				dateMatch(actual.customerDeadline, expected.customerDeadline)
			)
		);
	}
	if (expected.customerAppointment !== undefined) {
		checks.push(
			hard(
				'customerAppointment',
				expected.customerAppointment,
				actual.customerAppointment,
				dateMatch(actual.customerAppointment, expected.customerAppointment)
			)
		);
	}
	if (expected.deliverableHints !== undefined) {
		checks.push(
			soft(
				'deliverableHints',
				expected.deliverableHints,
				actual.deliverableHints,
				hintsMatch(actual.deliverableHints, expected.deliverableHints)
			)
		);
	}

	// Noise from the attachment leaking into the scope is a hard failure, not a near miss.
	const haystack = [actual.requestType, ...actual.deliverableHints].join(' ').toLowerCase();
	for (const forbidden of fixture.expected.mustNotExtract ?? []) {
		const leaked = haystack.includes(forbidden.toLowerCase());
		checks.push({
			label: `must not extract "${forbidden}"`,
			expected: false,
			actual: leaked,
			ok: !leaked,
			isHard: true
		});
	}
	return checks;
}

const soft = (label: string, expected: unknown, actual: unknown, ok: boolean): Check => ({
	label,
	expected,
	actual,
	ok,
	isHard: false
});

// Dates are hard: a wrong deadline or appointment is the one error the owner physically acts on,
// so it must never hide inside the single tolerated soft miss.
const hard = (label: string, expected: unknown, actual: unknown, ok: boolean): Check => ({
	...soft(label, expected, actual, ok),
	isHard: true
});
