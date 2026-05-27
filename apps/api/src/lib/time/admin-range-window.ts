import type { AIUsageRange } from '@offertum/shared';

/**
 * Resolve a wall-clock `[rangeStart, rangeEnd)` window from one of the four admin-dashboard
 * range chips. Reused by every admin aggregate endpoint (AI usage, classifier quality,
 * future cost-per-org breakdowns) so a "Last 7 days" tile means the same window everywhere.
 *
 * The `rangeStart` for `today` is normalized to start-of-day UTC; for `7d` / `30d` it's
 * `now - N days` (rolling). `all` uses 2000-01-01 — far enough back to cover every row we'd
 * ever care about without a DB-specific UNIX-zero quirk.
 */
export function resolveAdminRangeWindow(range: AIUsageRange): { rangeStart: Date; rangeEnd: Date } {
	const now = new Date();
	const rangeEnd = new Date(now);
	const rangeStart = new Date(now);

	switch (range) {
		case 'today':
			rangeStart.setUTCHours(0, 0, 0, 0);
			break;
		case '7d':
			rangeStart.setUTCDate(rangeStart.getUTCDate() - 7);
			break;
		case '30d':
			rangeStart.setUTCDate(rangeStart.getUTCDate() - 30);
			break;
		case 'all':
			rangeStart.setUTCFullYear(2000, 0, 1);
			rangeStart.setUTCHours(0, 0, 0, 0);
			break;
	}

	return { rangeStart, rangeEnd };
}
