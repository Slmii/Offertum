import { AppIcon } from '@/components/AppIcon.component';
import { Banner } from '@/components/Banner.component';
import { patternsQueryOptions, useDismissPattern } from '@/lib/queries/patterns.queries';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
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

	if (patterns.length === 0) {
		return null;
	}

	return (
		<Stack useFlexGap spacing={1} sx={{ mb: 3 }}>
			{dismiss.isError && <Banner tone='error'>Verbergen is niet gelukt. Probeer het opnieuw.</Banner>}
			{patterns.map(pattern => (
				<Banner
					key={pattern.patternKey}
					tone='info'
					title={pattern.headline}
					action={
						<IconButton
							size='small'
							aria-label='Verbergen'
							disabled={dismiss.isPending}
							onClick={() => dismiss.mutate({ key: pattern.patternKey })}
							sx={{ color: 'inherit', mt: -0.5, mr: -0.5 }}
						>
							<AppIcon name='x' size='medium' />
						</IconButton>
					}
				>
					{pattern.detail}
				</Banner>
			))}
		</Stack>
	);
}
