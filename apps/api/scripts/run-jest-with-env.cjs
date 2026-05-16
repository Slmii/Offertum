#!/usr/bin/env node
/**
 * Launcher used by `pnpm test:ai` (and its `:classifier` / `:extractor` variants).
 *
 * Responsibilities:
 *  1. Load `.env` into process.env (so the live accuracy specs see `OPENAI_API_KEY`).
 *  2. Generate a `AI_REPORT_RUN_ID` and inject it into the child env, so both spec files
 *     write under the same run identifier in `.ai-reports/runs.jsonl`.
 *  3. Spawn Jest as a child process (forwarding stdio so output streams to the terminal).
 *  4. After Jest exits, rebuild `.ai-reports/index.html` from the JSONL.
 *  5. Exit with Jest's status code.
 *
 * Why a launcher script instead of inline `node -r dotenv/config jest`:
 *  - pnpm's `.bin` symlink layout differs from npm's, so the npm-style invocation breaks.
 *  - We need to run code AFTER Jest exits (the report rebuild), which `require('jest/bin/
 *    jest')` can't support (Jest's CLI calls `process.exit` itself).
 *  - Spawning Jest as a child lets us catch its exit and run the post-step cleanly.
 */

const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

require('dotenv').config();

// One run ID per launcher invocation. Used by the spec files (via env) and the HTML
// builder (via JSONL) to group classifier + extractor results from the same `pnpm test:ai`.
const runId = process.env.AI_REPORT_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-');

// Resolve Jest's CLI entry via Node's module resolver — works under npm + pnpm both.
const jestCli = require.resolve('jest/bin/jest');

const result = spawnSync(process.execPath, [jestCli, ...process.argv.slice(2)], {
	stdio: 'inherit',
	env: { ...process.env, AI_REPORT_RUN_ID: runId }
});

// Always try to rebuild the HTML report, even if Jest failed — partial run data is still
// useful for debugging which fixture broke.
try {
	require(join(__dirname, 'build-ai-report.cjs'));
} catch (err) {
	console.warn('[run-jest-with-env] HTML report build failed:', err.message);
}

process.exit(result.status ?? 0);
