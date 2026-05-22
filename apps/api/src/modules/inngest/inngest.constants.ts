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
	MicrosoftDeltaChanged: 'microsoft/delta.changed',
	/**
	 * Fired by `OpportunitiesService.processOneRawMessage` after a new Opportunity row is
	 * successfully created. Payload: `{ opportunityId, organizationId }`. Triggers
	 * `ReplyDraftGenerateFunction` (W5.3) which composes the AI reply draft in the org
	 * OWNER's voice.
	 */
	OpportunityCreated: 'opportunity/created',
	/**
	 * W5.6 — Fired when:
	 *   1. A customer reply lands on an existing thread (`RawMessage.threadId` matches an
	 *      Opportunity's originating message); OR
	 *   2. The owner clicks "Concept-vervolg opstellen" on a SENT draft.
	 * Payload: `{ opportunityId, organizationId, triggeredBy: 'customer_reply' | 'owner_compose' }`.
	 * Triggers the same `ReplyDraftGenerateFunction` as `OpportunityCreated`, but the
	 * handler routes follow-up events to `generateFollowupDraft` (no idempotency short-
	 * circuit — always creates a new draft row).
	 */
	OpportunityFollowupReceived: 'opportunity/followup.received',
	/**
	 * W6.1 — Fan-out event from the daily `FollowUpSchedulerFunction` cron. Payload:
	 * `{ opportunityId, organizationId }`. One event per eligible REPLIED opportunity
	 * per tick. Triggers `FollowUpProcessorFunction` which re-validates eligibility
	 * (cap / cadence / latest-draft-status) before spending an OpenAI call.
	 */
	OpportunitySilenceFollowupDue: 'opportunity/silence.followup-due'
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
	MicrosoftSubscriptionRenewal: 'microsoft-subscription-renewal',
	/** W5.3 reply-draft generate — fires on `opportunity/created`, composes the AI draft
	 *  in the org OWNER's voice and persists a `ReplyDraft` row. Idempotent via the
	 *  `opportunityId @unique` constraint. */
	ReplyDraftGenerate: 'reply-draft-generate',
	/** W6.1 — Daily cron at 09:00 UTC. Enumerates eligible REPLIED opportunities per
	 *  org and fans out `opportunity/silence.followup-due` events. */
	FollowUpScheduler: 'follow-up-scheduler',
	/** W6.1 — Per-opp processor. Listens to `opportunity/silence.followup-due`,
	 *  re-validates the eligibility window, generates the check-in draft. */
	FollowUpProcessor: 'follow-up-processor'
} as const;

/**
 * Step names grouped under their owning function.
 *
 * **Every step name is globally unique** — even though Inngest documents step names as
 * scoped per-function, in dev mode we've observed step result memoization that bleeds
 * across functions when names collide (e.g. a Microsoft `'sync'` step receiving Gmail's
 * cached `'sync'` step result with completely wrong shape). Prefixing each step with its
 * function's provider closes that hole entirely and costs us nothing — the dev-UI run
 * timeline gets *more* scannable, not less, because step names now read as full sentences.
 */
export const InngestSteps = {
	Hello: {
		ComposeGreeting: 'hello-compose-greeting'
	},
	Heartbeat: {
		RecordTick: 'heartbeat-record-tick'
	},
	GmailBackfill: {
		/** The whole 90-day fetch + persist loop. One step today; split later if it timeouts. */
		Backfill: 'gmail-backfill',
		/** Per-batch process step. Built dynamically as `${ProcessOpportunitiesBatch}-${i}`
		 * so each Inngest step is bounded by `PROCESS_BATCH_SIZE` and individual batches
		 * can be retried in isolation. */
		ProcessOpportunitiesBatch: 'gmail-backfill-process-opportunities-batch',
		/** Watch-start runs as a separate Inngest step after backfill completes so Inngest's
		 * retry on a watch failure doesn't re-run the backfill. */
		StartWatch: 'gmail-start-watch'
	},
	MicrosoftBackfill: {
		Backfill: 'microsoft-backfill',
		ProcessOpportunitiesBatch: 'microsoft-backfill-process-opportunities-batch',
		/** Step 2 — register the Graph subscription so future arrivals fire push pings.
		 * Separate step so an Inngest retry on a subscription failure doesn't re-run the
		 * (expensive, idempotent-but-slow) backfill. */
		StartSubscription: 'microsoft-start-subscription'
	},
	GmailDeltaSync: {
		/** Single step: walk history, fetch payloads, persist. */
		Sync: 'gmail-delta-sync-walk',
		ProcessOpportunitiesBatch: 'gmail-delta-sync-process-opportunities-batch'
	},
	GmailWatchRenewal: {
		/** Single step: scan, re-watch, persist new expiry. */
		Renew: 'gmail-watch-renew'
	},
	MicrosoftDeltaSync: {
		/** Single step: walk `/me/messages/delta` from cursor, persist new rows. */
		Sync: 'microsoft-delta-sync-walk',
		ProcessOpportunitiesBatch: 'microsoft-delta-sync-process-opportunities-batch'
	},
	MicrosoftSubscriptionRenewal: {
		/** Single step: scan rows, PATCH subscriptions, persist new expiry. */
		Renew: 'microsoft-subscription-renew'
	},
	ReplyDraftGenerate: {
		/** Single step: fetch opportunity + owner voice → call generator → persist row. */
		Generate: 'reply-draft-generate-compose'
	},
	FollowUpScheduler: {
		/** Single step: query candidates + fan out one event per opp. */
		FanOut: 'follow-up-scheduler-fan-out'
	},
	FollowUpProcessor: {
		/** Single step: re-validate eligibility + generate the check-in draft. */
		Generate: 'follow-up-processor-generate'
	}
} as const;
