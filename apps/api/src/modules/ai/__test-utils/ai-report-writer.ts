import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Test-only utility: append one JSON line to `.ai-reports/runs.jsonl` from a live accuracy
 * spec. The launcher (`scripts/run-jest-with-env.cjs`) sets `AI_REPORT_RUN_ID` env when
 * the user runs `pnpm test:ai` — when that's missing, this helper no-ops, so normal
 * `pnpm test` invocations don't leave artifacts.
 *
 * After Jest exits, `scripts/build-ai-report.cjs` reads the JSONL and renders a fresh
 * `.ai-reports/index.html` you can open in a browser. Both files live under
 * `apps/api/.ai-reports/` which is gitignored — for local review only.
 */
export function appendAiReportEntry(entry: object): void {
	const runId = process.env.AI_REPORT_RUN_ID;
	if (!runId) {
		return;
	}

	// Use process.cwd() (which is `apps/api/` when running via the npm script) rather than
	// __dirname-based resolution because Jest's swc transform muddies relative paths.
	const reportsDir = join(process.cwd(), '.ai-reports');
	if (!existsSync(reportsDir)) {
		mkdirSync(reportsDir, { recursive: true });
	}

	const line =
		JSON.stringify({
			runId,
			timestamp: new Date().toISOString(),
			...entry
		}) + '\n';
	appendFileSync(join(reportsDir, 'runs.jsonl'), line);
}
