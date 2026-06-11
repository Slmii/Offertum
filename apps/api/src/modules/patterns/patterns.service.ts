import { Injectable } from '@nestjs/common';
import type { PatternKey } from '@offertum/shared';

import { isPatternVisible } from './pattern-visibility';
import { PatternsRepository } from './patterns.repository';
import type { BucketStat, PatternBanner } from './patterns.types';

@Injectable()
export class PatternsService {
	constructor(private readonly repository: PatternsRepository) {}

	/**
	 * Builds the visible insight banners for a user's dashboard. A banner is included only
	 * when (a) the org has crossed the opportunity threshold and the user hasn't recently
	 * dismissed it (`isPatternVisible`), AND (b) the underlying metric has enough data to
	 * be meaningful. Returns 0, 1, or 2 banners.
	 */
	async getPatterns(organizationId: string, userId: string, now: Date = new Date()): Promise<PatternBanner[]> {
		// W13 is an entitled-only feature. Gate the read gracefully: non-entitled orgs get
		// no banners (rather than a 402) so the dashboard renders without the feature.
		if (!(await this.repository.isOrganizationEntitled(organizationId))) {
			return [];
		}

		const total = await this.repository.countOpportunities(organizationId);
		const dismissals = await this.repository.findDismissals(organizationId, userId);

		const banners: PatternBanner[] = [];

		const replySpeedBanner = await this.buildReplySpeedBanner(
			organizationId,
			total,
			dismissals.get('reply_speed') ?? null,
			now
		);
		if (replySpeedBanner) {
			banners.push(replySpeedBanner);
		}

		const winRateBanner = await this.buildWinRateBanner(
			organizationId,
			total,
			dismissals.get('win_rate_by_speed') ?? null,
			now
		);
		if (winRateBanner) {
			banners.push(winRateBanner);
		}

		return banners;
	}

	async dismiss(organizationId: string, userId: string, patternKey: PatternKey, now: Date = new Date()): Promise<void> {
		await this.repository.upsertDismissal(organizationId, userId, patternKey, now);
	}

	private async buildReplySpeedBanner(
		organizationId: string,
		total: number,
		dismissedAt: Date | null,
		now: Date
	): Promise<PatternBanner | null> {
		if (!isPatternVisible({ totalOpportunities: total, dismissedAt }, now)) {
			return null;
		}

		const { avgCustomerReplyDays } = await this.repository.replySpeedStats(organizationId);
		// Data-sufficiency gate: need a real average to say anything.
		if (avgCustomerReplyDays === null) {
			return null;
		}

		const avg = Math.round(avgCustomerReplyDays * 10) / 10;
		const cadence = await this.repository.getFollowUpCadenceDays(organizationId);
		const headline = `Klanten reageren gemiddeld binnen ${this.formatDays(avg)} dagen`;

		let detail: string;
		if (cadence === null) {
			detail = 'Stel een automatische follow-up-cadans in om sneller op te volgen.';
		} else if (avg < cadence) {
			detail = `Je automatische follow-up staat op ${cadence} dagen — je zou eerder kunnen opvolgen.`;
		} else {
			detail = `Je follow-up cadans van ${cadence} dagen sluit hier goed op aan.`;
		}

		return { patternKey: 'reply_speed', headline, detail };
	}

	private async buildWinRateBanner(
		organizationId: string,
		total: number,
		dismissedAt: Date | null,
		now: Date
	): Promise<PatternBanner | null> {
		if (!isPatternVisible({ totalOpportunities: total, dismissedAt }, now)) {
			return null;
		}

		const buckets = await this.repository.winRateByResponseBucket(organizationId);
		const fastPct = this.winRatePercent(buckets.fast);
		const slowPct = this.winRatePercent(buckets.slow);

		// Data-sufficiency gate: need at least one bucket with closed deals.
		if (fastPct === null && slowPct === null && this.winRatePercent(buckets.medium) === null) {
			return null;
		}

		const headline = 'Snel reageren wint meer offertes';

		let detail: string;
		if (fastPct !== null && slowPct !== null && fastPct > slowPct) {
			// Both ends have data and fast wins more — frame it as the speed-wins insight.
			detail = `Je wint ${fastPct}% bij reactie binnen 4u, tegen ${slowPct}% bij meer dan 24u.`;
		} else {
			// Otherwise stay neutral and factual with whatever buckets have data.
			detail = this.neutralWinRateDetail(buckets);
		}

		return { patternKey: 'win_rate_by_speed', headline, detail };
	}

	// Win rate as a whole-number percentage, or null when the bucket has no closed deals.
	private winRatePercent(bucket: BucketStat): number | null {
		const closed = bucket.wonCount + bucket.lostCount;
		if (closed === 0) {
			return null;
		}
		return Math.round((bucket.wonCount / closed) * 100);
	}

	private neutralWinRateDetail(buckets: { fast: BucketStat; medium: BucketStat; slow: BucketStat }): string {
		const parts: string[] = [];
		const fast = this.winRatePercent(buckets.fast);
		const medium = this.winRatePercent(buckets.medium);
		const slow = this.winRatePercent(buckets.slow);
		if (fast !== null) {
			parts.push(`${fast}% bij reactie binnen 4u`);
		}
		if (medium !== null) {
			parts.push(`${medium}% bij reactie tussen 4u en 24u`);
		}
		if (slow !== null) {
			parts.push(`${slow}% bij meer dan 24u`);
		}
		return `Je wint ${parts.join(', ')}.`;
	}

	// 1-decimal Dutch number formatting; drops a trailing ",0" so whole days read cleanly.
	private formatDays(value: number): string {
		const rounded = Math.round(value * 10) / 10;
		if (Number.isInteger(rounded)) {
			return String(rounded);
		}
		return rounded.toFixed(1).replace('.', ',');
	}
}
