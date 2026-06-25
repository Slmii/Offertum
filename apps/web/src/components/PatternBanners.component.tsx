import { AppIcon } from '@/components/AppIcon.component';
import { BannerStack, type BannerStackItem } from '@/components/BannerStack.component';
import { patternsQueryOptions, useDismissPattern } from '@/lib/queries/patterns.queries';
import IconButton from '@mui/material/IconButton';
import { useSuspenseQuery } from '@tanstack/react-query';

/**
 * Renders 0–2 dismissible info banners surfacing AI-detected performance patterns
 * (e.g. reply-speed insights, win-rate correlations). The server already applies the
 * ≥10-opportunity gate and 30-day dismissal window — this component just renders
 * whatever the query returns. Renders nothing when the array is empty.
 *
 * Placed near the top of the dashboard (home route). Uses the loader-prefetched
 * `patternsQueryOptions` so there is no render-then-fetch waterfall. Built on the DRY
 * `Banner` component so the styling stays consistent with the design system.
 */
export function PatternBanners() {
	const { data: patterns } = useSuspenseQuery(patternsQueryOptions);
	const dismiss = useDismissPattern();

	// Collapse the error notice + each detected pattern into one framed stack.
	const banners: BannerStackItem[] = [];
	if (dismiss.isError) {
		banners.push({ key: 'dismiss-error', tone: 'error', body: 'Verbergen is niet gelukt. Probeer het opnieuw.' });
	}

	for (const pattern of patterns) {
		banners.push({
			key: pattern.patternKey,
			tone: 'info',
			title: pattern.headline,
			body: pattern.detail,
			action: (
				<IconButton
					size='small'
					aria-label='Verbergen'
					disabled={dismiss.isPending}
					onClick={() => dismiss.mutate({ key: pattern.patternKey })}
					sx={{ color: 'inherit' }}
				>
					<AppIcon name='x' size='medium' />
				</IconButton>
			)
		});
	}

	if (banners.length === 0) {
		return null;
	}

	return <BannerStack banners={banners} />;
}
