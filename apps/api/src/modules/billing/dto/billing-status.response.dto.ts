/**
 * Discriminator the UI switches on. Values mirror Stripe's Subscription.status enum
 * plus two non-Stripe states for the period before a customer has ever subscribed:
 *  - `local_trial`: no Stripe subscription yet; org is within its 14-day local grace.
 *  - `expired`: no Stripe subscription yet; local grace has lapsed (writes are gated).
 */
export type BillingState =
	| 'local_trial'
	| 'expired'
	| 'trialing'
	| 'active'
	| 'past_due'
	| 'unpaid'
	| 'canceled'
	| 'paused'
	| 'incomplete'
	| 'incomplete_expired';

export class BillingStatusResponseDto {
	state!: BillingState;

	/**
	 * ISO timestamp of when the current period ends.
	 *  - `local_trial` / `expired`: `Organization.createdAt + 14d`.
	 *  - `trialing`: end of trial (also the date Stripe makes the first charge).
	 *  - `active`: next renewal date.
	 *  - terminal states (canceled with no remaining period): `null`.
	 */
	currentPeriodEnd!: string | null;

	cancelAtPeriodEnd!: boolean;

	paymentMethodBrand!: string | null;
	paymentMethodLast4!: string | null;
}
