/**
 * MOCK DATA — billing invoice history + next-invoice + Stripe Customer ID.
 *
 * These three surfaces in the "Abonnement" design have NO backend yet:
 *  - `GET /api/billing/status` does not expose `stripeCustomerId`.
 *  - There is no upcoming-invoice endpoint (only an untracked `invoice.upcoming`
 *    webhook on the API side).
 *  - Invoice history is currently delegated entirely to the Stripe Customer Portal
 *    ("Beheer abonnement" → Portal), so no local invoice list API exists.
 *
 * Everything here is clearly-typed and isolated in this `*.mock.ts` module so it can
 * be swapped for a real `createServerFn` + `queryOptions` read once the API lands.
 * The `MOCK_` prefix and this header keep it from being mistaken for production data.
 */

export interface NextInvoiceLine {
	label: string;
	/** Amount in cents (EUR). */
	amountCents: number;
}

export interface NextInvoice {
	/** ISO date of the upcoming charge. */
	dueDateIso: string;
	/** Total amount in cents (EUR). */
	totalCents: number;
	lines: NextInvoiceLine[];
}

export interface PastInvoice {
	id: string;
	/** Human invoice number, e.g. `INV-2026-005`. */
	number: string;
	/** ISO date the invoice was issued. */
	issuedAtIso: string;
	/** Amount in cents (EUR). */
	amountCents: number;
	/** Where the PDF would be downloaded from (Stripe-hosted in production). */
	pdfUrl: string;
}

/** Placeholder Stripe Customer ID — real value comes from `billing/status` once exposed. */
export const MOCK_STRIPE_CUSTOMER_ID = 'cus_PqXz8YqAB4nMrt';

/** Upcoming invoice preview: base tier + per-seat overage breakdown. */
export const MOCK_NEXT_INVOICE: NextInvoice = {
	dueDateIso: '2026-06-01',
	totalCents: 20_900,
	lines: [
		{ label: 'Offertum Pro · 3 zitplekken inbegrepen', amountCents: 17_900 },
		{ label: '1 extra zitplek', amountCents: 3_000 }
	]
};

/** Most-recent-first invoice history. PDF download is a no-op placeholder for now. */
export const MOCK_PAST_INVOICES: PastInvoice[] = [
	{ id: 'inv-005', number: 'INV-2026-005', issuedAtIso: '2026-05-01', amountCents: 17_900, pdfUrl: '#' },
	{ id: 'inv-004', number: 'INV-2026-004', issuedAtIso: '2026-04-01', amountCents: 17_900, pdfUrl: '#' },
	{ id: 'inv-003', number: 'INV-2026-003', issuedAtIso: '2026-03-01', amountCents: 14_900, pdfUrl: '#' }
];
