import type { EnvSchema } from '@/config/env.schema';
import {
	noStripeCustomerForOrg,
	STRIPE_CHECKOUT_URL_MISSING,
	STRIPE_PRICE_ID_MISSING,
	STRIPE_SECRET_KEY_MISSING,
	subscriptionAlreadyActive,
	trialUpgradeNotTrialing
} from '@/lib/errors';
import {
	BASE_PRICE_CENTS,
	LIVE_SUBSCRIPTION_STATUSES,
	PER_SEAT_OVERAGE_CENTS,
	SEAT_SYNC_STATUSES,
	SEATS_INCLUDED
} from '@/modules/billing/billing.constants';
import type { BillingStatusResponseDto } from '@/modules/billing/dto/billing-status.response.dto';
import { LogService } from '@/modules/logger/log.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BillingState } from '@offertum/shared';
import { createHash } from 'node:crypto';
import Stripe from 'stripe';

/**
 * Stripe events we react to. Anything outside this list is ignored.
 * Every tracked event triggers a full re-sync from Stripe → DB, NOT a partial update
 * from the event payload — this avoids the split-brain problem of trusting event order
 * or partial data. See: Theo's "How I Stay Sane Implementing Stripe".
 */
const TRACKED_EVENTS: ReadonlyArray<string> = [
	'checkout.session.completed',
	'customer.subscription.created',
	'customer.subscription.updated',
	'customer.subscription.deleted',
	'customer.subscription.trialing',
	'customer.subscription.paused',
	'customer.subscription.resumed',
	'customer.subscription.pending_update_applied',
	'customer.subscription.pending_update_expired',
	'customer.subscription.trial_will_end',
	'invoice.paid',
	'invoice.payment_failed',
	'invoice.payment_action_required',
	'invoice.upcoming',
	'invoice.marked_uncollectible',
	'invoice.payment_succeeded',
	'payment_intent.succeeded',
	'payment_intent.payment_failed',
	'payment_intent.canceled'
];

@Injectable()
export class BillingService {
	private readonly stripe: InstanceType<typeof Stripe>;
	/** Per-customer promise chain serializing `syncFromStripe` — see its docstring. */
	private readonly syncChains = new Map<string, Promise<{ status: string | null; isPaymentProcessing: boolean }>>();

	constructor(
		private readonly prisma: PrismaService,
		private readonly config: ConfigService<EnvSchema, true>,
		private readonly logService: LogService
	) {
		const secretKey = this.config.get('STRIPE_SECRET_KEY', { infer: true });
		if (!secretKey) {
			throw new Error(STRIPE_SECRET_KEY_MISSING);
		}

		// Pin the API version. Bumping is a deliberate decision documented in the upgrade
		// guide at https://docs.stripe.com/upgrades — never let the SDK silently roll
		// forward into a breaking change.
		this.stripe = new Stripe(secretKey, {
			apiVersion: '2026-05-27.dahlia'
		});
	}

	/** Get the Stripe instance for signature verification in the controller. */
	get stripeClient(): InstanceType<typeof Stripe> {
		return this.stripe;
	}

	/**
	 * Ensure there's a Stripe customer for this org (and a Subscription row pointing at it).
	 * Idempotent — returns the existing customerId if it's still alive in Stripe, otherwise
	 * heals the row by creating a fresh customer (handles the common dev scenario where
	 * Stripe test data is cleared or you switch test accounts).
	 */
	async getOrCreateCustomer(organizationId: string): Promise<string> {
		const existing = await this.prisma.subscription.findUnique({
			where: { organizationId }
		});

		if (existing) {
			// Verify the customer still exists in the current Stripe account. If it was
			// deleted out from under us (account swap, test data wiped), fall through to
			// re-create instead of failing every checkout attempt forever. The recreate
			// itself emits `billing.customer.regenerated` below — we don't double-log here.
			try {
				const customer = await this.stripe.customers.retrieve(existing.stripeCustomerId);
				if (!customer.deleted) {
					return existing.stripeCustomerId;
				}
			} catch (error) {
				if (!isResourceMissingError(error)) {
					throw error;
				}
			}
		}

		const customerName = await this.resolveCustomerName(organizationId);

		// Idempotency key construction. Stripe caches the response under this key
		// for ~24h — a true retry (network flake mid-request) returns the same
		// customer instead of creating two. BUT: the cached response contains the
		// resulting customer ID, so the key must change when the *intent* changes.
		//   - First-ever create for this org → `customer-create:${orgId}`.
		//   - Regeneration after the previous customer was deleted out from under
		//     us (Stripe Dashboard wipe, account swap, etc.) → include the dead
		//     customer's ID as salt so we escape the cached response. Without
		//     this, Stripe would serve us back the deleted customer's ID and
		//     downstream Checkout immediately 404s with "No such customer: …".
		const idempotencyKey = existing
			? `customer-create:${organizationId}:after-${existing.stripeCustomerId}`
			: `customer-create:${organizationId}`;
		const customer = await this.stripe.customers.create(
			{
				name: customerName,
				metadata: { organizationId }
			},
			{ idempotencyKey }
		);

		// Upsert because the Subscription row may already exist with a stale customerId.
		// Reset all the synced fields too — they belong to the dead customer.
		await this.prisma.subscription.upsert({
			where: { organizationId },
			create: {
				organizationId,
				stripeCustomerId: customer.id
			},
			update: {
				stripeCustomerId: customer.id,
				stripeSubscriptionId: null,
				status: null,
				priceId: null,
				currentPeriodStart: null,
				currentPeriodEnd: null,
				cancelAtPeriodEnd: false,
				pendingUpdateExpiresAt: null,
				paymentMethodBrand: null,
				paymentMethodLast4: null
			}
		});

		this.logService.logAction({
			action: existing ? 'billing.customer.regenerated' : 'billing.customer.created',
			message: existing
				? `Recreated Stripe customer for org ${organizationId} (old: ${existing.stripeCustomerId}, new: ${customer.id})`
				: `Created Stripe customer ${customer.id} for org ${organizationId}`,
			metadata: {
				organizationId,
				newCustomerId: customer.id,
				...(existing ? { previousCustomerId: existing.stripeCustomerId, reason: 'resource_missing' } : {})
			},
			context: 'BillingService'
		});
		return customer.id;
	}

	/**
	 * Create a Stripe Checkout session for the org's subscription. Returns the hosted
	 * checkout URL to redirect the user to. Always uses a pre-created customer to avoid
	 * Stripe's "ephemeral customer" footgun.
	 */
	async createCheckoutSession(organizationId: string): Promise<{ url: string }> {
		const priceId = this.config.get('STRIPE_PRICE_ID', { infer: true });
		if (!priceId) {
			throw new InternalServerErrorException(STRIPE_PRICE_ID_MISSING);
		}

		// Enforce one live subscription per org. The UI hides the Subscribe button in these
		// states (so this path is normally unreachable), but a direct POST would otherwise
		// create a duplicate Stripe sub on the same customer. Direct the user to the Portal
		// to manage what they already have.
		const existing = await this.prisma.subscription.findUnique({
			where: { organizationId },
			select: { status: true }
		});

		if (existing?.status && LIVE_SUBSCRIPTION_STATUSES.includes(existing.status)) {
			this.logService.logAction({
				action: 'billing.checkout.rejected',
				message: `Checkout rejected — org ${organizationId} already has a ${existing.status} subscription`,
				metadata: { organizationId, currentStatus: existing.status, reason: 'one_live_sub_guard' },
				level: 'warn',
				context: 'BillingService'
			});
			throw new ConflictException(subscriptionAlreadyActive(existing.status));
		}

		const customerId = await this.getOrCreateCustomer(organizationId);

		// Second guard against STRIPE, not just the local row: a missed/late webhook can
		// leave the local Subscription stale or empty, and completing a second Checkout
		// then creates a SECOND live Stripe subscription — which `syncFromStripe`'s
		// newest-first `limit: 1` read would silently hide forever (double billing).
		const liveAtStripe = await this.stripe.subscriptions.list({
			customer: customerId,
			status: 'all',
			limit: 100
		});
		const liveSub = liveAtStripe.data.find(sub => LIVE_SUBSCRIPTION_STATUSES.includes(sub.status));
		if (liveSub) {
			// Self-heal the stale local row so the UI reflects reality on the next read.
			try {
				await this.syncFromStripe(customerId);
			} catch (error) {
				this.logService.logAction({
					action: 'billing.checkout.self_heal_failed',
					message: `Failed to self-heal local subscription for customer ${customerId} during checkout rejection`,
					metadata: { organizationId, customerId },
					level: 'warn',
					stack: error instanceof Error ? error.stack : undefined,
					context: 'BillingService'
				});
			}
			this.logService.logAction({
				action: 'billing.checkout.rejected',
				message: `Checkout rejected — Stripe reports a ${liveSub.status} subscription for org ${organizationId} (local row was stale)`,
				metadata: {
					organizationId,
					customerId,
					currentStatus: liveSub.status,
					reason: 'stripe_live_sub_guard'
				},
				level: 'warn',
				context: 'BillingService'
			});
			throw new ConflictException(subscriptionAlreadyActive(liveSub.status));
		}
		const webOrigin = this.config.get('WEB_ORIGIN', { infer: true });
		// Initial seat count = current active memberships. The Stripe Price is tiered, so
		// passing `quantity: N` lets Stripe compute base + overage automatically. A subsequent
		// invitation will call `syncSeatCount` to bump the quantity mid-cycle (prorated).
		const seatCount = await this.countActiveSeats(organizationId);

		// Per-org idempotency salted with the second-precision timestamp so honest
		// retries within a few seconds get the same session URL, but the user can
		// re-attempt checkout minutes later (after cancelling) without colliding.
		// Without a salt, the same key would forever return the original session.
		const idempotencySalt = Math.floor(Date.now() / 1000);
		const session = await this.stripe.checkout.sessions.create(
			{
				customer: customerId,
				mode: 'subscription',
				// Trustworthy reference back to our org — visible in the Stripe Dashboard
				// + Sessions API, distinct from `subscription_data.metadata` which is
				// scoped to the Subscription that results from the Session.
				client_reference_id: organizationId,
				line_items: [{ price: priceId, quantity: seatCount }],
				// Payment methods are configured in the Stripe Dashboard (Payment Method
				// Configurations) — DO NOT pass `payment_method_types` here. Letting Stripe
				// pick dynamically maximizes conversion + lets you enable iDEAL/SEPA/cards
				// per region from the Dashboard without a deploy. For Offertum: enable
				// "card", "ideal", and "sepa_debit" in the Dashboard's payment methods
				// settings for your account. iDEAL signs a SEPA mandate during checkout;
				// recurring charges run via SEPA Direct Debit automatically.
				currency: 'eur',
				allow_promotion_codes: true,
				// EU B2B tax compliance: Stripe Tax computes the right VAT per
				// customer location, applies B2B reverse-charge when a valid VAT ID is
				// collected (intra-EU), and writes the breakdown onto every invoice.
				// Requires Stripe Tax to be enabled in the Dashboard + tax registrations
				// to be added for the jurisdictions you sell into (NL at minimum).
				// See https://docs.stripe.com/tax/checkout.
				automatic_tax: { enabled: true },
				// Collect the customer's VAT number. When present and valid, Stripe
				// applies the reverse-charge mechanism so the buyer (not us) accounts
				// for VAT in their country.
				tax_id_collection: { enabled: true },
				// Required for `automatic_tax` to work: Stripe needs the customer's
				// billing address to determine the tax jurisdiction. `'required'`
				// forces collection in Checkout; `'auto'` would skip the form if the
				// customer already has an address on file. We use `required` because
				// at first Checkout the customer is freshly created with no address.
				billing_address_collection: 'required',
				// Save the address + name + VAT ID Checkout collected back onto the
				// Stripe Customer object so future invoices reuse them automatically
				// without a second Checkout. Without this, `automatic_tax` works for
				// the first invoice but loses the address on renewal.
				customer_update: {
					address: 'auto',
					name: 'auto'
				},
				success_url: `${webOrigin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
				cancel_url: `${webOrigin}/billing/cancel`,
				// Card-less trial: the first invoice is fully covered by the 14-day trial (€0 due
				// now), so `if_required` tells Checkout to SKIP payment-method collection. A card
				// is only collected later, at subscribe-time, via the Customer Portal. (Address +
				// VAT ID are still collected above for `automatic_tax`; those aren't a card.)
				payment_method_collection: 'if_required',
				subscription_data: {
					metadata: { organizationId },
					// Every new subscription starts with 14 days free — no card required to start.
					// The `Subscription.status` flips "trialing" → "active" at trial end; our sync
					// function picks that up via `customer.subscription.updated`.
					trial_period_days: 14,
					// If the trial ends with NO payment method on file, PAUSE the subscription
					// instead of letting Stripe raise an unpayable invoice. `paused` is excluded
					// from ENTITLED_STRIPE_STATUSES, so writes correctly re-gate to /billing. Once
					// the owner adds a card via the Portal, Stripe converts trialing → active at
					// trial end automatically (no pause).
					trial_settings: {
						end_behavior: { missing_payment_method: 'pause' }
					}
				}
			},
			{ idempotencyKey: `checkout-create:${organizationId}:${idempotencySalt}` }
		);

		if (!session.url) {
			throw new InternalServerErrorException(STRIPE_CHECKOUT_URL_MISSING);
		}

		this.logService.logAction({
			action: 'billing.checkout.created',
			message: `Checkout session ${session.id} created for org ${organizationId}`,
			metadata: { organizationId, sessionId: session.id, seatCount, priceId },
			context: 'BillingService'
		});

		return { url: session.url };
	}

	/**
	 * Create a Stripe Customer Portal session. The Portal is Stripe's hosted UI for
	 * subscription management — users can update their payment method, see invoices,
	 * cancel/resume their subscription, and update billing details there.
	 *
	 * Configuration (what features are visible) is set in the Stripe Dashboard at
	 * https://dashboard.stripe.com/test/settings/billing/portal — not via code. Enable
	 * "Customer can update payment methods", "Customer can cancel subscriptions", etc.
	 */
	async createPortalSession(organizationId: string): Promise<{ url: string }> {
		const sub = await this.prisma.subscription.findUnique({
			where: { organizationId }
		});
		if (!sub) {
			throw new InternalServerErrorException(noStripeCustomerForOrg(organizationId));
		}

		const webOrigin = this.config.get('WEB_ORIGIN', { infer: true });
		// Same salt pattern as Checkout — within a second a retry returns the same
		// portal URL; minutes later the user gets a fresh session.
		const idempotencySalt = Math.floor(Date.now() / 1000);
		const session = await this.stripe.billingPortal.sessions.create(
			{
				customer: sub.stripeCustomerId,
				return_url: `${webOrigin}/billing`
			},
			{ idempotencyKey: `portal-create:${organizationId}:${idempotencySalt}` }
		);

		return { url: session.url };
	}

	/**
	 * "Upgrade to paid now" — end the Stripe trial immediately so the org converts from
	 * `trialing` → `active` (or `past_due`/`incomplete` if the saved card declines). Setting
	 * `trial_end: 'now'` makes Stripe finalize the first invoice + charge the payment method
	 * captured at Checkout. We re-sync straight away (rather than waiting for the webhook) so
	 * the caller's next status read reflects the new state in one round-trip — the same trust
	 * model as the success endpoint. The trialing → active transition inside `syncFromStripe`
	 * also pushes the current seat count to Stripe via `syncSeatCount`.
	 *
	 * Guarded to `trialing` only: there's nothing to end on a non-trial sub, and short-circuiting
	 * here avoids charging a customer who is already `active`/`past_due`. The web button is only
	 * shown during trial; this is the server-side enforcement.
	 */
	async endTrialNow(organizationId: string): Promise<{ ok: boolean; status: string | null }> {
		const sub = await this.prisma.subscription.findUnique({
			where: { organizationId },
			select: { stripeCustomerId: true, stripeSubscriptionId: true, status: true }
		});

		if (!sub?.stripeSubscriptionId) {
			throw new InternalServerErrorException(noStripeCustomerForOrg(organizationId));
		}
		if (sub.status !== 'trialing') {
			throw new ConflictException(trialUpgradeNotTrialing(sub.status ?? 'none'));
		}

		// Stable (un-salted) idempotency key: ending a trial must never double-charge. A retry
		// returns the same result; a second deliberate call is already blocked by the `trialing`
		// guard above once the status has flipped.
		await this.stripe.subscriptions.update(
			sub.stripeSubscriptionId,
			{ trial_end: 'now' },
			{ idempotencyKey: `end-trial:${organizationId}:${sub.stripeSubscriptionId}` }
		);

		const result = await this.syncFromStripe(sub.stripeCustomerId);
		// `ok` reflects whether the upgrade is on track, NOT merely that we ended the trial.
		// `active` = charged + paid. `past_due` WITH a processing payment = a SEPA/iDEAL debit
		// still settling (can take days) — also a success in flight, so `ok: true`. A genuine
		// failure (declined card → `past_due` with a retry scheduled, or `incomplete`) is
		// `ok: false` so the caller can prompt the owner to fix their payment method. The trial
		// seat cap lifts either way (it only gates `trialing`).
		const upgraded = result.status === 'active' || (result.status === 'past_due' && result.isPaymentProcessing);
		this.logService.logAction({
			action: 'billing.trial.ended_early',
			message: `Trial ended early for org ${organizationId} (trialing → ${result.status ?? 'unknown'})`,
			metadata: { organizationId, customerId: sub.stripeCustomerId, newStatus: result.status, upgraded },
			level: upgraded ? undefined : 'warn',
			context: 'BillingService'
		});
		return { ok: upgraded, status: result.status };
	}

	/**
	 * Fetch the current state of the customer's subscription from Stripe and persist it
	 * to our local DB. Single source-of-truth function — called from the success
	 * endpoint AND every webhook. Never trust webhook payloads directly.
	 *
	 * Serialized per customer via an in-process keyed promise chain: a webhook burst
	 * fires several concurrent syncs for the same customer, and without ordering the
	 * OLDER Stripe snapshot can be persisted last (read-from-Stripe and write-to-DB
	 * interleave). Sufficient for the current single-instance deploy; a horizontally
	 * scaled deployment would need a distributed lock (e.g. Postgres advisory lock).
	 */
	async syncFromStripe(customerId: string): Promise<{ status: string | null; isPaymentProcessing: boolean }> {
		const previous = this.syncChains.get(customerId) ?? Promise.resolve();
		// Chain regardless of how the previous call settled — a failed sync must not
		// block subsequent ones.
		const run = previous.catch(() => undefined).then(() => this.performSyncFromStripe(customerId));
		this.syncChains.set(customerId, run);
		const cleanup = () => {
			// Only delete the map entry if no newer call chained onto us meanwhile.
			if (this.syncChains.get(customerId) === run) {
				this.syncChains.delete(customerId);
			}
		};
		run.then(cleanup, cleanup);
		return run;
	}

	private async performSyncFromStripe(
		customerId: string
	): Promise<{ status: string | null; isPaymentProcessing: boolean }> {
		// Stripe returns subscriptions in reverse chronological order by default
		// (newest `created` first) — documented behavior, no `order_by` param exists
		// on this endpoint. So `data[0]` is reliably the most recent subscription
		// even if the customer has prior canceled ones.
		const subscriptions = await this.stripe.subscriptions.list({
			customer: customerId,
			limit: 1,
			status: 'all',
			// `latest_invoice` lets us tell a payment that's still settling (SEPA/iDEAL — a
			// delayed-notification method, can take days) from one that actually failed, so the
			// UI shows "processing" rather than "failed" for `past_due`.
			expand: ['data.default_payment_method', 'data.items', 'data.latest_invoice']
		});

		// Capture the previous status BEFORE we overwrite it so we can log the transition.
		// `findUnique` is cheap (indexed on stripeCustomerId) and the row always exists by
		// the time this runs — getOrCreateCustomer upserts it during Checkout.
		const before = await this.prisma.subscription.findUnique({
			where: { stripeCustomerId: customerId },
			select: { status: true, organizationId: true }
		});
		const previousStatus = before?.status ?? null;
		const organizationId = before?.organizationId ?? null;

		if (subscriptions.data.length === 0) {
			// `updateMany` (not `update`) is idempotent against the customer-regeneration
			// race: if `getOrCreateCustomer` wiped + re-created the Subscription row mid-
			// flight, `update` throws P2025 (Record not found). `updateMany` silently
			// no-ops on 0 rows — same pattern we use in `EmailAccountsService` for the
			// parallel-disconnect race.
			await this.prisma.subscription.updateMany({
				where: { stripeCustomerId: customerId },
				data: {
					stripeSubscriptionId: null,
					status: null,
					priceId: null,
					currentPeriodStart: null,
					currentPeriodEnd: null,
					cancelAtPeriodEnd: false,
					pendingUpdateExpiresAt: null,
					paymentMethodBrand: null,
					paymentMethodLast4: null,
					paymentProcessing: false
				}
			});
			this.logService.logAction({
				action: 'billing.subscription.synced',
				message: `Cleared subscription state for customer ${customerId} (${previousStatus ?? 'none'} → none)`,
				metadata: { organizationId, customerId, previousStatus, newStatus: null },
				context: 'BillingService'
			});
			return { status: null, isPaymentProcessing: false };
		}

		const sub = subscriptions.data[0]!;
		// Stripe moved `current_period_*` from Subscription → SubscriptionItem in 2024.
		const item = sub.items.data[0];
		const pm = sub.default_payment_method;
		const paymentMethod = pm && typeof pm !== 'string' ? pm : null;

		// Stripe creates `pending_update` when a sub change requires payment confirmation
		// (e.g. customer hit "Change plan" in the Portal but their card needs 3DS). Stored
		// as a timestamp so the UI can render "Plan change expires on <date>". Object
		// shape on Stripe: `{ expires_at: <unix>, ...staged change details we don't store }`.
		const pendingUpdate = sub.pending_update;
		const pendingUpdateExpiresAt = pendingUpdate?.expires_at ? new Date(pendingUpdate.expires_at * 1000) : null;
		const paymentProcessing = isInvoicePaymentProcessing(sub.latest_invoice);

		// `updateMany` for the same race-safety reason as the no-subscription branch above.
		await this.prisma.subscription.updateMany({
			where: { stripeCustomerId: customerId },
			data: {
				stripeSubscriptionId: sub.id,
				status: sub.status,
				priceId: item?.price.id ?? null,
				currentPeriodStart: item?.current_period_start ? new Date(item.current_period_start * 1000) : null,
				currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
				cancelAtPeriodEnd: sub.cancel_at_period_end,
				pendingUpdateExpiresAt,
				paymentMethodBrand: paymentMethod?.type ?? null,
				paymentMethodLast4: extractLast4(paymentMethod),
				paymentProcessing
			}
		});

		this.logService.logAction({
			action: 'billing.subscription.synced',
			message: `Synced subscription ${sub.id} for customer ${customerId} (${previousStatus ?? 'none'} → ${sub.status})`,
			metadata: {
				organizationId,
				customerId,
				subscriptionId: sub.id,
				previousStatus,
				newStatus: sub.status,
				cancelAtPeriodEnd: sub.cancel_at_period_end,
				seatCount: item?.quantity ?? null,
				currentPeriodEnd: item?.current_period_end
					? new Date(item.current_period_end * 1000).toISOString()
					: null
			},
			context: 'BillingService'
		});

		// Trial-end seat reconciliation. `SEAT_SYNC_STATUSES` excludes `trialing` so
		// invites/removes during trial only touch the local `Membership.count`. When
		// the trial converts to `active` (or skips ahead to `past_due`), the Stripe
		// quantity is still the seat count at trial-start time. Push the final count
		// now so the first real invoice charges the right number of seats. Skipped
		// when no organizationId is known (race during customer regeneration) — the
		// next membership change will resync.
		if (organizationId && previousStatus === 'trialing' && (sub.status === 'active' || sub.status === 'past_due')) {
			await this.syncSeatCount(organizationId);
		}

		// Drift-check: keep Stripe's customer.name in step with Organization.name so
		// invoices always carry the current legal/customer-facing label. The org
		// row was already fetched above (organizationId lookup); fetch the name in
		// a single round-trip and update Stripe only when it differs. Best-effort —
		// a Stripe API hiccup here shouldn't fail the sync.
		if (organizationId) {
			await this.reconcileCustomerName(organizationId, customerId).catch(error => {
				this.logService.logAction({
					action: 'billing.customer.name_sync_failed',
					message: `Customer name sync failed for org ${organizationId}: ${error instanceof Error ? error.message : 'unknown'}`,
					metadata: { organizationId, customerId },
					level: 'warn',
					stack: error instanceof Error ? error.stack : undefined,
					context: 'BillingService'
				});
			});
		}

		return { status: sub.status, isPaymentProcessing: paymentProcessing };
	}

	/**
	 * Read-only snapshot of the org's billing state for the UI. Returns a DTO that the
	 * client switches on to render the trial banner / next-billing-date / cancellation
	 * notice. No Stripe calls — pure DB read.
	 */
	async getStatus(organizationId: string): Promise<BillingStatusResponseDto> {
		const [sub, seatsUsed] = await Promise.all([
			this.prisma.subscription.findUnique({ where: { organizationId } }),
			this.countActiveSeats(organizationId)
		]);

		const seats = {
			used: seatsUsed,
			included: SEATS_INCLUDED,
			overagePerSeatCents: PER_SEAT_OVERAGE_CENTS,
			baseMonthlyPriceCents: BASE_PRICE_CENTS
		};

		// Stripe-tracked path: status is the source of truth.
		if (sub?.status) {
			return {
				state: sub.status as BillingState,
				currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
				cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
				isPaymentProcessing: sub.paymentProcessing,
				pendingUpdateExpiresAt: sub.pendingUpdateExpiresAt?.toISOString() ?? null,
				paymentMethodBrand: sub.paymentMethodBrand,
				paymentMethodLast4: sub.paymentMethodLast4,
				seats
			};
		}

		// No Subscription row → the org has never reached Checkout. Writes are gated by
		// EntitlementGuard; the UI surfaces a single "Start your 14-day free trial" CTA
		// that routes through Stripe Checkout (which captures the card and creates the
		// `trialing` Stripe sub — that's the only trial in this model).
		return {
			state: 'none',
			currentPeriodEnd: null,
			cancelAtPeriodEnd: false,
			isPaymentProcessing: false,
			pendingUpdateExpiresAt: null,
			paymentMethodBrand: null,
			paymentMethodLast4: null,
			seats
		};
	}

	/**
	 * Reconcile Stripe's billed seat count with the org's current membership count.
	 * Called after any membership change (invitation accepted, member removed). Idempotent.
	 *
	 *  - No Stripe subscription yet → no-op (the seat count will be picked up at Checkout).
	 *  - Status not in SEAT_SYNC_STATUSES → no-op (canceled / unpaid / expired).
	 *  - Stripe already shows the right quantity → no-op (avoid pointless API calls + proration noise).
	 *  - Otherwise → `subscriptions.update` with `proration_behavior: 'create_prorations'`.
	 *
	 * Failures are logged but not rethrown — the caller (e.g. invitation acceptance) should
	 * not be rolled back just because Stripe was unreachable. A subsequent change re-runs sync.
	 */
	async syncSeatCount(organizationId: string): Promise<void> {
		const sub = await this.prisma.subscription.findUnique({
			where: { organizationId },
			select: { stripeSubscriptionId: true, status: true }
		});

		if (!sub?.stripeSubscriptionId || !sub.status || !SEAT_SYNC_STATUSES.includes(sub.status)) {
			return;
		}

		const desiredQuantity = await this.countActiveSeats(organizationId);

		try {
			const remote = await this.stripe.subscriptions.retrieve(sub.stripeSubscriptionId, {
				expand: ['items']
			});

			const item = remote.items.data[0];
			if (!item) {
				this.logService.logAction({
					action: 'billing.seats.sync.no_items',
					message: `Subscription ${sub.stripeSubscriptionId} has no items — cannot sync seats`,
					metadata: { organizationId, subscriptionId: sub.stripeSubscriptionId },
					level: 'warn',
					context: 'BillingService'
				});
				return;
			}

			if (item.quantity === desiredQuantity) {
				return;
			}

			// Idempotency key bound to the (subscription, target quantity) tuple. A
			// retry of the same intended transition is a no-op; a real subsequent
			// transition (different desiredQuantity) gets a different key.
			await this.stripe.subscriptions.update(
				sub.stripeSubscriptionId,
				{
					items: [{ id: item.id, quantity: desiredQuantity }],
					proration_behavior: 'create_prorations'
				},
				{ idempotencyKey: `seat-sync:${sub.stripeSubscriptionId}:${desiredQuantity}` }
			);

			this.logService.logAction({
				action: 'billing.seats.synced',
				message: `Seat count updated for org ${organizationId} (${item.quantity ?? '?'} → ${desiredQuantity})`,
				metadata: {
					organizationId,
					subscriptionId: sub.stripeSubscriptionId,
					from: item.quantity ?? null,
					to: desiredQuantity,
					prorationBehavior: 'create_prorations'
				},
				context: 'BillingService'
			});
		} catch (error) {
			this.logService.logAction({
				action: 'billing.seats.sync_failed',
				message: `Seat sync failed for org ${organizationId}: ${error instanceof Error ? error.message : 'unknown'}`,
				metadata: { organizationId, subscriptionId: sub.stripeSubscriptionId },
				level: 'error',
				stack: error instanceof Error ? error.stack : undefined,
				context: 'BillingService'
			});
		}
	}

	private async countActiveSeats(organizationId: string): Promise<number> {
		// Active membership = a row in Membership. We don't soft-delete; if it exists, the
		// user has access and should count toward the seat bill.
		return this.prisma.membership.count({ where: { organizationId } });
	}

	/**
	 * Resolve the name we want on the Stripe Customer for this org. Single
	 * source of truth for every code path that writes `customer.name` to Stripe
	 * (initial create, drift reconciliation, explicit-update entrypoint). Today
	 * it's just `org.name` — kept as a one-liner helper so a future split (e.g.
	 * separate legal-entity name from a public trade name) only changes this
	 * function, not every callsite.
	 */
	private async resolveCustomerName(organizationId: string): Promise<string> {
		const org = await this.prisma.organization.findUniqueOrThrow({
			where: { id: organizationId },
			select: { name: true }
		});
		return org.name;
	}

	/**
	 * Reconcile the Stripe customer's `name` with the current `Organization.name`.
	 * Idempotent: if they already match, no Stripe call. Used during
	 * `syncFromStripe` so any drift (org renamed via business-details, data
	 * backfill) gets corrected on the next webhook tick. Callers that already
	 * KNOW the name changed (e.g. business-details update) should call
	 * `syncCustomerNameForOrg` — same flow but starts from an organizationId.
	 */
	private async reconcileCustomerName(organizationId: string, customerId: string): Promise<void> {
		const [desiredName, customer] = await Promise.all([
			this.resolveCustomerName(organizationId),
			this.stripe.customers.retrieve(customerId)
		]);
		if (customer.deleted) {
			return;
		}
		if (customer.name === desiredName) {
			return;
		}
		await this.updateCustomerName(organizationId, customerId, desiredName);
	}

	/**
	 * Public entrypoint for code paths that just changed `Organization.name` —
	 * primarily `MeService.updateBusinessDetails`. No-ops cleanly when the org
	 * has no Stripe customer yet (hasn't reached Checkout), or when the name
	 * already matches what Stripe has. Best-effort — a Stripe API hiccup is
	 * logged but never throws back to the caller; their write already succeeded.
	 */
	async syncCustomerNameForOrg(organizationId: string): Promise<void> {
		const sub = await this.prisma.subscription.findUnique({
			where: { organizationId },
			select: { stripeCustomerId: true }
		});
		if (!sub) {
			return;
		}
		try {
			await this.reconcileCustomerName(organizationId, sub.stripeCustomerId);
		} catch (error) {
			this.logService.logAction({
				action: 'billing.customer.name_sync_failed',
				message: `Customer name sync failed for org ${organizationId}: ${error instanceof Error ? error.message : 'unknown'}`,
				metadata: { organizationId, customerId: sub.stripeCustomerId },
				level: 'warn',
				stack: error instanceof Error ? error.stack : undefined,
				context: 'BillingService'
			});
		}
	}

	/**
	 * Cancel the live Stripe subscription before an organization is deleted. The
	 * local Subscription row is cascade-deleted with the org, so this is the last
	 * chance to avoid orphan billing in Stripe.
	 */
	async cancelSubscriptionForOrgDelete(organizationId: string): Promise<void> {
		const sub = await this.prisma.subscription.findUnique({
			where: { organizationId },
			select: { stripeSubscriptionId: true, status: true }
		});
		if (!sub?.stripeSubscriptionId || sub.status === 'canceled' || sub.status === 'incomplete_expired') {
			return;
		}

		try {
			await this.stripe.subscriptions.cancel(
				sub.stripeSubscriptionId,
				{},
				{ idempotencyKey: `org-delete-sub-cancel:${sub.stripeSubscriptionId}` }
			);
		} catch (error) {
			if (!isResourceMissingError(error)) {
				throw error;
			}
		}

		this.logService.logAction({
			action: 'billing.subscription.cancelled_for_org_delete',
			message: `Cancelled Stripe subscription ${sub.stripeSubscriptionId} before deleting org ${organizationId}`,
			metadata: { organizationId, subscriptionId: sub.stripeSubscriptionId },
			context: 'BillingService'
		});
	}

	/**
	 * Push a new customer name to Stripe directly. Lower-level than
	 * `syncCustomerNameForOrg` — caller must know the Stripe customer ID and
	 * the target name. Idempotency key includes a hash of the name so concurrent
	 * rename → rename-back doesn't collapse to one update.
	 */
	async updateCustomerName(organizationId: string, customerId: string, name: string): Promise<void> {
		await this.stripe.customers.update(
			customerId,
			{ name },
			{ idempotencyKey: `customer-name-update:${customerId}:${hashShort(name)}` }
		);
		this.logService.logAction({
			action: 'billing.customer.name_synced',
			message: `Stripe customer ${customerId} name updated to "${name}" for org ${organizationId}`,
			metadata: { organizationId, customerId, name },
			context: 'BillingService'
		});
	}

	/**
	 * Webhook event router. Skips non-tracked events; for tracked ones, extracts the
	 * customer id from the event payload and triggers a full re-sync. Errors are caught
	 * by the caller and logged — the webhook endpoint always 200s to prevent Stripe
	 * retry storms while a sync transiently fails.
	 */
	async handleWebhookEvent(
		event: ReturnType<InstanceType<typeof Stripe>['webhooks']['constructEvent']>
	): Promise<void> {
		if (!TRACKED_EVENTS.includes(event.type)) {
			return;
		}

		// Dedup. Stripe retries the same `event.id` with exponential backoff when our
		// endpoint doesn't 2xx in time, AND occasionally redelivers events after the
		// fact (replay from the Dashboard, dual-region delivery). Insert-first means
		// the unique constraint on `eventId` decides who gets to process — losers
		// throw on the insert (P2002 unique violation) and return early. Idempotent
		// `syncFromStripe` would still produce the right end state on a duplicate
		// run, but skipping avoids redundant Stripe API calls + log spam.
		try {
			await this.prisma.stripeWebhookEvent.create({
				data: { eventId: event.id, type: event.type }
			});
		} catch (error) {
			if (isUniqueConstraintError(error)) {
				this.logService.logAction({
					action: 'billing.webhook.duplicate_delivery',
					message: `Webhook event ${event.id} already processed — skipping`,
					metadata: { eventId: event.id, eventType: event.type },
					context: 'BillingService'
				});
				return;
			}
			// Any other persistence failure is unexpected — log + still process
			// the event so a transient DB hiccup doesn't drop a real Stripe signal.
			this.logService.logAction({
				action: 'billing.webhook.dedup_persist_failed',
				message: `Failed to persist webhook dedup row for ${event.id} — processing anyway`,
				metadata: { eventId: event.id, eventType: event.type },
				level: 'warn',
				stack: error instanceof Error ? error.stack : undefined,
				context: 'BillingService'
			});
		}

		const object = event.data.object as { customer?: string | null };
		const customerId = object.customer;

		if (typeof customerId !== 'string') {
			this.logService.logAction({
				action: 'billing.webhook.skipped_no_customer',
				message: `Event ${event.type} has no customer id — skipping`,
				metadata: { eventType: event.type, eventId: event.id },
				level: 'warn',
				context: 'BillingService'
			});
			return;
		}

		try {
			await this.syncFromStripe(customerId);
		} catch (error) {
			// Release the dedup row so a redelivery of this event actually reprocesses.
			// Without this, a transiently-failed sync is permanently marked processed —
			// for a terminal event like `customer.subscription.deleted` that means a
			// canceled org keeps entitlement until some other event happens to land.
			// (The endpoint 200s immediately, so this mainly covers Dashboard replays
			// and out-of-band redeliveries.) Best-effort: a failed delete only costs a
			// duplicate-skip on replay, never the original error.
			try {
				await this.prisma.stripeWebhookEvent.deleteMany({ where: { eventId: event.id } });
			} catch (releaseError) {
				this.logService.logAction({
					action: 'billing.webhook.dedup_release_failed',
					message: `Failed to release dedup row for event ${event.id} after sync failure`,
					metadata: { eventId: event.id, eventType: event.type },
					level: 'error',
					stack: releaseError instanceof Error ? releaseError.stack : undefined,
					context: 'BillingService'
				});
			}
			throw error;
		}
	}
}

/** Prisma's P2002 unique-constraint violation, surfaced via the error code. */
function isUniqueConstraintError(error: unknown): boolean {
	return (
		typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002'
	);
}

interface PaymentMethodLike {
	type: string;
	card?: { last4?: string | null } | null;
	sepa_debit?: { last4?: string | null } | null;
}

// Structural view of the fields we read off the latest invoice — same duck-typing approach
// as PaymentMethodLike (Stripe's CJS `export =` makes the `Stripe.Invoice` namespace type
// awkward to reference directly).
interface InvoiceLike {
	status: string | null;
	attempted: boolean;
	next_payment_attempt: number | null;
}

/**
 * Stripe's "No such customer / object" errors come back as `code: 'resource_missing'`.
 * Detect via duck-typing to avoid relying on the SDK's instanceof types (which are
 * awkward to access via Stripe's CJS `export =`).
 */
function isResourceMissingError(error: unknown): boolean {
	return error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'resource_missing';
}

/**
 * Short, deterministic hash of arbitrary string content, intended only for
 * salting idempotency keys (not security). 8 hex chars of SHA-256 is more
 * than enough collision-resistance for the (customerId, targetValue) pairs
 * we generate keys for — Stripe's keys also support up to 255 chars, but
 * keeping them short keeps logs tidy.
 */
function hashShort(value: string): string {
	return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

function extractLast4(pm: PaymentMethodLike | null): string | null {
	if (!pm) {
		return null;
	}

	if (pm.type === 'card') {
		return pm.card?.last4 ?? null;
	}

	if (pm.type === 'sepa_debit') {
		return pm.sepa_debit?.last4 ?? null;
	}

	return null;
}

/**
 * Whether the latest invoice's payment is still settling (a delayed-notification method like
 * SEPA Direct Debit, which can take days) rather than failed. Stripe leaves such an invoice
 * `open` + `attempted` with NO `next_payment_attempt` scheduled while the bank debit is in
 * flight; a genuine failure (declined card, rejected mandate) schedules a retry
 * (`next_payment_attempt` set) or moves the sub to `unpaid`/`canceled`. We use this to render
 * `past_due` as "Payment processing" instead of "Payment failed".
 */
function isInvoicePaymentProcessing(invoice: InvoiceLike | string | null | undefined): boolean {
	if (!invoice || typeof invoice === 'string') {
		return false;
	}
	return invoice.status === 'open' && invoice.attempted && invoice.next_payment_attempt === null;
}
