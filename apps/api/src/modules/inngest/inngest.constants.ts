/**
 * Single source of truth for every Inngest "magic string" the app uses: event names
 * (in `inngest.send` + function `triggers:`), function ids (used by the dev UI and
 * Inngest's internal routing), and step names (passed to `step.run()` for durable
 * checkpointing and dev-UI display).
 *
 * Rules:
 *  - Add new strings here BEFORE referencing them in code. A typo in one place + a
 *    matching typo in another silently breaks the trigger; centralizing forces both
 *    sides to refer to the same constant.
 *  - Event names use Inngest's recommended `domain/action.qualifier` format.
 *  - Function ids are short kebab-case slugs; they appear in URLs in the dev UI.
 *  - Step names are short kebab-case strings, scoped under their owning function.
 *
 * Pattern mirrors `billing.constants.ts` / `gmail.constants.ts` — flat, grouped by
 * concern, `as const` for literal-type narrowing at call sites.
 */

export const InngestEvents = {
	/** Fired by `EmailAccountsService.upsertEmailAccount` after a successful Gmail OAuth handshake. */
	GmailAccountConnected: 'gmail/account.connected',
	/** Fired by `EmailAccountsService.upsertEmailAccount` after a successful Microsoft OAuth handshake. */
	MicrosoftAccountConnected: 'microsoft/account.connected',
	/**
	 * Fired by the Gmail webhook controller (W3.5) when Gmail's Pub/Sub push tells us the
	 * mailbox changed. Payload: `{ emailAccountId }`. Triggers `GmailDeltaSyncFunction`.
	 */
	GmailHistoryChanged: 'gmail/history.changed',
	/**
	 * Fired by the Microsoft webhook controller (W3.6) when Graph pushes a `created`
	 * notification. Payload: `{ emailAccountId }`. Triggers `MicrosoftDeltaSyncFunction`.
	 */
	MicrosoftDeltaChanged: 'microsoft/delta.changed'
} as const;

export type InngestEventName = (typeof InngestEvents)[keyof typeof InngestEvents];

export const InngestFunctionIds = {
	/** W3.3 smoke — event-triggered (`test/hello`). */
	Hello: 'hello',
	/** W3.3 smoke — cron-scheduled `0 * * * *`. */
	Heartbeat: 'heartbeat',
	/** W3.4 backfill — fetches last 90 days into `RawMessage` on `GmailAccountConnected`. */
	GmailBackfill: 'gmail-backfill',
	/** W3.2 backfill — same shape as Gmail's, against Microsoft Graph. */
	MicrosoftBackfill: 'microsoft-backfill',
	/** W3.5 delta-sync — runs `users.history.list` from the stored cursor on push. */
	GmailDeltaSync: 'gmail-delta-sync',
	/** W3.5 renewal cron — re-calls `users.watch` on rows nearing the 7-day expiry. */
	GmailWatchRenewal: 'gmail-watch-renewal',
	/** W3.6 delta-sync — walks `/me/messages/delta` from the stored cursor on Graph push. */
	MicrosoftDeltaSync: 'microsoft-delta-sync',
	/** W3.6 renewal cron — PATCHes Graph subscriptions nearing the 3-day expiry. */
	MicrosoftSubscriptionRenewal: 'microsoft-subscription-renewal'
} as const;

/**
 * Step names grouped under their owning function. The grouping prevents accidental
 * collisions (two functions can both have a `fetch-page` step without ambiguity) and
 * makes the dev-UI run timeline scannable.
 */
export const InngestSteps = {
	Hello: {
		ComposeGreeting: 'compose-greeting'
	},
	Heartbeat: {
		RecordTick: 'record-tick'
	},
	GmailBackfill: {
		/** The whole 90-day fetch + persist loop. One step today; split later if it timeouts. */
		Backfill: 'backfill',
		/** Watch-start runs as a separate Inngest step after backfill completes so Inngest's
		 * retry on a watch failure doesn't re-run the backfill. */
		StartWatch: 'start-watch'
	},
	MicrosoftBackfill: {
		Backfill: 'backfill',
		/** Step 2 — register the Graph subscription so future arrivals fire push pings.
		 * Separate step so an Inngest retry on a subscription failure doesn't re-run the
		 * (expensive, idempotent-but-slow) backfill. */
		StartSubscription: 'start-subscription'
	},
	GmailDeltaSync: {
		/** Single step: walk history, fetch payloads, persist. */
		Sync: 'sync'
	},
	GmailWatchRenewal: {
		/** Single step: scan, re-watch, persist new expiry. */
		Renew: 'renew'
	},
	MicrosoftDeltaSync: {
		/** Single step: walk `/me/messages/delta` from cursor, persist new rows. */
		Sync: 'sync'
	},
	MicrosoftSubscriptionRenewal: {
		/** Single step: scan rows, PATCH subscriptions, persist new expiry. */
		Renew: 'renew'
	}
} as const;
