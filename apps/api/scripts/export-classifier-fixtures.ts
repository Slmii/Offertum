import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '../src/generated/prisma/client';
import { DismissReason } from '../src/generated/prisma/enums';
import type { EmailProvider } from '../src/generated/prisma/enums';
import { buildRawMessageAIInput } from '../src/lib/email/raw-message-ai-input';

/**
 * W4.6.6 — Fixture-candidate export CLI.
 *
 * Walks owner-dismissed opportunities (reason `NOT_A_QUOTE` or `SPAM`) and emits one
 * candidate per line as JSONL. The shape mirrors the W4.2 classifier corpus's
 * `ClassifierFixture` so the output can be reviewed by a human and pasted into
 * `apps/api/src/modules/ai/classifier/fixtures/nl-quote-requests.fixtures.ts`.
 *
 * The CLI does NOT promote candidates into the corpus automatically — every fixture is
 * a labelled training signal, and a model-extraction routine can't safely auto-label
 * (the owner's dismiss intent is the label, but it benefits from human cleanup of
 * PII + truncation choices).
 *
 * Usage:
 *
 *   pnpm fixtures:export
 *   pnpm fixtures:export --reason NOT_A_QUOTE
 *   pnpm fixtures:export --since 2026-04-01
 *   pnpm fixtures:export --org <uuid> --limit 50
 *   pnpm fixtures:export --out ./tmp/fixtures.jsonl
 *
 * Defaults: both reasons, last 90 days, limit 100, output written to
 * `.fixture-candidates/classifier-YYYYMMDD-HHmmss.jsonl` (gitignored).
 */

interface ParsedArgs {
	reason?: 'NOT_A_QUOTE' | 'SPAM';
	since?: Date;
	org?: string;
	limit: number;
	out?: string;
	dryRun: boolean;
}

const DEFAULT_LIMIT = 100;
const DEFAULT_WINDOW_DAYS = 90;
// Cap on the bodyText we serialize per fixture — keeps the JSONL diff-friendly and
// matches the "≤ ~4kB to stay within the cheap-model context budget" comment on
// `ClassifierInput.bodyText`.
const BODY_TEXT_MAX_CHARS = 4_000;

interface CandidateRecord {
	exportedAt: string;
	opportunityId: string;
	organizationId: string;
	dismissReason: DismissReason;
	dismissedAt: string;
	expectedIsQuote: false; // every dismissal is a labelled "no, not a quote"
	suggestedCategory: 'negative' | 'edge';
	notes: string;
	input: ReturnType<typeof buildRawMessageAIInput>;
	classifier: ClassifierContext | null;
}

interface ClassifierContext {
	provider: string;
	model: string;
	originalIsQuote: boolean | null;
	originalConfidence: number | null;
	originalReason: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
	const args: ParsedArgs = { limit: DEFAULT_LIMIT, dryRun: false };
	for (let i = 0; i < argv.length; i += 1) {
		const flag = argv[i];
		const value = argv[i + 1];
		if (flag === '--reason') {
			args.reason = parseReason(value);
		}
		if (flag === '--since') {
			args.since = parseSince(value);
		}
		if (flag === '--org') {
			args.org = value;
		}
		if (flag === '--limit') {
			args.limit = parseLimit(value);
		}
		if (flag === '--out') {
			args.out = value;
		}
		if (flag === '--dry-run') {
			args.dryRun = true;
		}
	}
	return args;
}

function parseReason(input: string | undefined): 'NOT_A_QUOTE' | 'SPAM' {
	if (input !== 'NOT_A_QUOTE' && input !== 'SPAM') {
		console.error(`--reason must be NOT_A_QUOTE or SPAM (got: ${input ?? 'undefined'}).`);
		process.exit(1);
	}
	return input;
}

function parseSince(input: string | undefined): Date {
	if (!input) {
		console.error('--since requires a value (YYYY-MM-DD).');
		process.exit(1);
	}
	const parsed = new Date(input);
	if (Number.isNaN(parsed.getTime())) {
		console.error(`--since must be a valid date (got: ${input}).`);
		process.exit(1);
	}
	return parsed;
}

function parseLimit(input: string | undefined): number {
	const n = Number(input);
	if (!Number.isInteger(n) || n <= 0) {
		console.error(`--limit must be a positive integer (got: ${input ?? 'undefined'}).`);
		process.exit(1);
	}
	return n;
}

function defaultSince(): Date {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - DEFAULT_WINDOW_DAYS);
	d.setUTCHours(0, 0, 0, 0);
	return d;
}

function defaultOutputPath(): string {
	const now = new Date();
	const pad = (n: number) => n.toString().padStart(2, '0');
	const stamp =
		`${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
		`-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
	return resolve(process.cwd(), '.fixture-candidates', `classifier-${stamp}.jsonl`);
}

// Maps the dismiss reason to a suggested fixture `category`. `NOT_A_QUOTE` rows live
// in `negative` (the classifier wrongly flagged them positive). `SPAM` rows live in
// `negative` too but bias toward `edge` because the bulk-mail pre-filter is the more
// natural place to learn from them — the human reviewer can route them appropriately.
function suggestCategory(reason: DismissReason): 'negative' | 'edge' {
	if (reason === DismissReason.SPAM) {
		return 'edge';
	}
	return 'negative';
}

function suggestNotes(reason: DismissReason, classifier: ClassifierContext | null): string {
	const reasonText = reason === DismissReason.SPAM ? 'spam / bulk' : 'no real quote intent';
	const confidence = classifier?.originalConfidence;
	const confidenceText =
		typeof confidence === 'number' ? ` (classifier originally ${(confidence * 100).toFixed(0)}% confident)` : '';
	return `Owner dismissed as ${reasonText}${confidenceText}.`;
}

function truncate(value: string, max: number): string {
	if (value.length <= max) {
		return value;
	}
	return `${value.slice(0, max)}\n\n[truncated to ${max} chars]`;
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const since = args.since ?? defaultSince();
	const reasonFilter = args.reason ?? undefined;
	const outPath = args.out ?? defaultOutputPath();

	if (!process.env.DATABASE_URL) {
		console.error('DATABASE_URL is required. Make sure apps/api/.env is populated.');
		process.exit(1);
	}

	const prisma = new PrismaClient({
		adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
	});

	try {
		const rows = await prisma.opportunity.findMany({
			where: {
				dismissedAt: { not: null, gte: since },
				dismissReason: reasonFilter
					? { equals: reasonFilter }
					: { in: [DismissReason.NOT_A_QUOTE, DismissReason.SPAM] },
				...(args.org ? { organizationId: args.org } : {})
			},
			orderBy: { dismissedAt: 'desc' },
			take: args.limit,
			include: {
				rawMessage: {
					select: {
						subject: true,
						fromEmail: true,
						fromName: true,
						raw: true,
						emailAccount: { select: { provider: true } }
					}
				},
				classifiedAiCall: {
					select: {
						provider: true,
						model: true,
						parsed: true
					}
				}
			}
		});

		const candidates: CandidateRecord[] = [];
		for (const row of rows) {
			if (!row.rawMessage || !row.dismissReason || !row.dismissedAt) {
				continue;
			}
			const classifier = parseClassifierContext(row.classifiedAiCall);
			const input = buildRawMessageAIInput({
				provider: row.rawMessage.emailAccount.provider as EmailProvider,
				subject: row.rawMessage.subject,
				fromName: row.rawMessage.fromName,
				fromEmail: row.rawMessage.fromEmail,
				raw: row.rawMessage.raw
			});
			candidates.push({
				exportedAt: new Date().toISOString(),
				opportunityId: row.id,
				organizationId: row.organizationId,
				dismissReason: row.dismissReason,
				dismissedAt: row.dismissedAt.toISOString(),
				expectedIsQuote: false,
				suggestedCategory: suggestCategory(row.dismissReason),
				notes: suggestNotes(row.dismissReason, classifier),
				input: {
					subject: input.subject,
					fromName: input.fromName,
					fromEmail: input.fromEmail,
					bodyText: truncate(input.bodyText, BODY_TEXT_MAX_CHARS)
				},
				classifier
			});
		}

		const summary = summarise(candidates);
		console.log(
			`Found ${candidates.length} candidate(s) since ${since.toISOString().slice(0, 10)}` +
				(args.org ? ` for org ${args.org}` : '') +
				(reasonFilter ? ` with reason ${reasonFilter}` : '') +
				`.`
		);
		console.log(`  ${summary.notAQuote} NOT_A_QUOTE · ${summary.spam} SPAM`);

		if (args.dryRun) {
			console.log(`(dry-run) skipping write.`);
			return;
		}

		mkdirSync(dirname(outPath), { recursive: true });
		writeFileSync(
			outPath,
			candidates.map(c => JSON.stringify(c)).join('\n') + (candidates.length > 0 ? '\n' : ''),
			'utf8'
		);
		console.log(`Wrote ${candidates.length} record(s) to ${outPath}`);
		console.log(`Review and paste relevant entries into:`);
		console.log(`  apps/api/src/modules/ai/classifier/fixtures/nl-quote-requests.fixtures.ts`);
	} finally {
		await prisma.$disconnect();
	}
}

function summarise(candidates: CandidateRecord[]): { notAQuote: number; spam: number } {
	let notAQuote = 0;
	let spam = 0;
	for (const c of candidates) {
		if (c.dismissReason === DismissReason.NOT_A_QUOTE) {
			notAQuote += 1;
		}
		if (c.dismissReason === DismissReason.SPAM) {
			spam += 1;
		}
	}
	return { notAQuote, spam };
}

function parseClassifierContext(
	call: { provider: string; model: string; parsed: unknown } | null
): ClassifierContext | null {
	if (!call) {
		return null;
	}
	const parsed = call.parsed as { isQuote?: unknown; confidence?: unknown; reason?: unknown } | null;
	return {
		provider: call.provider,
		model: call.model,
		originalIsQuote: typeof parsed?.isQuote === 'boolean' ? parsed.isQuote : null,
		originalConfidence: typeof parsed?.confidence === 'number' ? parsed.confidence : null,
		originalReason: typeof parsed?.reason === 'string' ? parsed.reason : null
	};
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});
