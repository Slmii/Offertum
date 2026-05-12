/**
 * Discriminator the UI switches on. Values mirror Stripe's Subscription.status enum
 * plus one non-Stripe state for orgs that have never reached Checkout:
 *  - `none`: no Subscription row yet. Writes are gated; user must Checkout to start
 *    the 14-day Stripe-managed trial.
 */
export type BillingState =
	| 'none'
	| 'trialing'
	| 'active'
	| 'past_due'
	| 'unpaid'
	| 'canceled'
	| 'paused'
	| 'incomplete'
	| 'incomplete_expired';

export class BillingSeatsDto {
	/** Active memberships on the org right now. */
	used!: number;
	/** Seats included in the base price (graduated tier 1). */
	included!: number;
	/** Per-seat price for seats beyond `included`, in cents (EUR). */
	overagePerSeatCents!: number;
}

export class BillingStatusResponseDto {
	state!: BillingState;

	/**
	 * ISO timestamp of when the current period ends.
	 *  - `none`: `null` (no period — the user hasn't started a trial yet).
	 *  - `trialing`: end of trial (also the date Stripe makes the first charge).
	 *  - `active`: next renewal date.
	 *  - terminal states (canceled with no remaining period): `null`.
	 */
	currentPeriodEnd!: string | null;

	cancelAtPeriodEnd!: boolean;

	paymentMethodBrand!: string | null;
	paymentMethodLast4!: string | null;

	seats!: BillingSeatsDto;
}
