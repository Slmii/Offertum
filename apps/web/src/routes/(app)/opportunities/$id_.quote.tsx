import { AppIcon } from '@/components/AppIcon.component';
import { SectionError } from '@/components/SectionError.component';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import { catalogItemsQueryOptions } from '@/lib/queries/catalog-items.queries';
import { opportunityDetailQueryOptions } from '@/lib/queries/opportunities.queries';
import { quoteDraftsQueryOptions } from '@/lib/queries/quote-drafts.queries';
import { vatSettingsQueryOptions } from '@/lib/queries/vat-settings.queries';
import { QuotePanel } from '@/routes/(app)/opportunities/-components/Quote/QuotePanel.component';
import Button from '@mui/material/Button';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';

/**
 * Quote builder page (`/opportunities/:id/quote`). Un-nested from the detail route (`$id_`) so it
 * renders standalone, not inside the detail layout. The editable quote table lives in `QuotePanel`;
 * this route just prefetches the draft + opportunity context and frames it with a back link.
 */
export const Route = createFileRoute('/(app)/opportunities/$id_/quote')({
	// Quote building is subscription-gated (the API quote endpoints require entitlement). Bounce
	// non-entitled orgs back to the opportunity detail, where the upsell lives.
	beforeLoad: async ({ context, params }) => {
		const status = await context.queryClient.ensureQueryData(billingStatusQueryOptions);
		if (!isBillingEntitled(status.state)) {
			throw redirect({ to: '/opportunities/$id', params: { id: params.id } });
		}
	},
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
		// The whole page scrolls with the app's document scroll — the back link, the quote header,
		// the table, and the totals all flow together (nothing pinned, no inner scroll region).
		<div>
			<Button
				size='small'
				variant='text'
				color='inherit'
				onClick={() => navigate({ to: '/opportunities/$id', params: { id } })}
				startIcon={<AppIcon name='arrow-left' size='small' />}
				sx={{ textTransform: 'none', fontWeight: 'normal', mb: 1 }}
			>
				Terug naar aanvraag
			</Button>
			<QuotePanel
				opportunityId={id}
				customerName={opportunity.customerName}
				requestType={opportunity.requestType}
			/>
		</div>
	);
}
