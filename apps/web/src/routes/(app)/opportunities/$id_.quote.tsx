import { AppIcon } from '@/components/AppIcon.component';
import { FixedPageLayout } from '@/components/FixedPageLayout.component';
import { SectionError } from '@/components/SectionError.component';
import { catalogItemsQueryOptions } from '@/lib/queries/catalog-items.queries';
import { opportunityDetailQueryOptions } from '@/lib/queries/opportunities.queries';
import { quoteDraftsQueryOptions } from '@/lib/queries/quote-drafts.queries';
import { vatSettingsQueryOptions } from '@/lib/queries/vat-settings.queries';
import { QuotePanel } from '@/routes/(app)/opportunities/-components/Quote/QuotePanel.component';
import Button from '@mui/material/Button';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

/**
 * Quote builder page (`/opportunities/:id/quote`). Un-nested from the detail route (`$id_`) so it
 * renders standalone, not inside the detail layout. The editable quote table lives in `QuotePanel`;
 * this route just prefetches the draft + opportunity context and frames it with a back link.
 */
export const Route = createFileRoute('/(app)/opportunities/$id_/quote')({
	loader: ({ context, params }) =>
		Promise.all([
			context.queryClient.ensureQueryData(opportunityDetailQueryOptions(params.id)),
			context.queryClient.ensureQueryData(quoteDraftsQueryOptions(params.id)),
			// The editor reads the live catalog to compute the "niet in je catalogus" count.
			context.queryClient.ensureQueryData(catalogItemsQueryOptions),
			// VAT config drives the quote-line VAT select + catalog add forms.
			context.queryClient.ensureQueryData(vatSettingsQueryOptions)
		]),
	component: QuotePage,
	errorComponent: SectionError
});

function QuotePage() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const { data: opportunity } = useSuspenseQuery(opportunityDetailQueryOptions(id));

	return (
		// Fixed-height page so the quote table fills it and its totals footer pins to the page
		// bottom; only the table rows scroll. Body scroll is disabled — the table owns scrolling.
		<FixedPageLayout
			header={
				<Button
					size='small'
					variant='text'
					color='inherit'
					onClick={() => navigate({ to: '/opportunities/$id', params: { id } })}
					startIcon={<AppIcon name='arrow-left' size='small' />}
					sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 'normal', mb: 1 }}
				>
					Terug naar aanvraag
				</Button>
			}
			bodySx={{ overflow: 'hidden', px: 0, mx: 0 }}
		>
			<QuotePanel
				opportunityId={id}
				customerName={opportunity.customerName}
				requestType={opportunity.requestType}
			/>
		</FixedPageLayout>
	);
}
