import { inngest } from '@/modules/inngest/inngest.client';
import { InngestEvents, InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
// Imported under an alias to match the convention from `define-mailbox-pipeline-function.ts`
// — the surrounding code uses `logContext` as a string identifier for the logger context,
// while the ALS module is `requestContext` to disambiguate.
import { logContext as requestContext } from '@/modules/logger/log-context';
import { LogService } from '@/modules/logger/log.service';
import { ReplyDraftsService } from '@/modules/reply-drafts/reply-drafts.service';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

/**
 * W5.3 + W5.6 — listens for two events emitted by the opportunities pipeline and
 * generates the appropriate AI reply draft:
 *  - `opportunity/created` → first-time draft on a brand-new opportunity. Idempotent
 *    via an explicit "any draft already exists?" check in `createIfAbsent` (the
 *    `@unique` constraint that previously guaranteed this was dropped in W5.6 to allow
 *    follow-up drafts).
 *  - `opportunity/followup.received` → fresh draft on an existing opportunity after a
 *    customer reply OR after the owner clicks "Concept-vervolg opstellen." ALWAYS
 *    creates a new draft row (no idempotency short-circuit). The Inngest function's
 *    retry budget covers transient OpenAI hiccups; a retry of an already-completed
 *    follow-up event will create a duplicate draft — an exceedingly rare race that
 *    the owner can resolve manually by deleting one. Tightening would require a
 *    consumed-events table or a per-event idempotency key, neither of which is worth
 *    it at MVP scale.
 *
 * AsyncLocalStorage: re-established INSIDE the `step.run` callback per W4 pattern #8.
 * Inngest schedules step callbacks on a different async chain than the handler body, so
 * wrapping only the outer handler with `requestContext.run` is not enough — the AICall
 * + Log rows produced inside the generator would otherwise land with the wrong
 * `requestId` and a NULL `organizationId`.
 */
@Injectable()
export class ReplyDraftGenerateFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(replyDrafts: ReplyDraftsService, logService: LogService) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.ReplyDraftGenerate,
				name: 'Reply draft generate',
				triggers: [
					{ event: InngestEvents.OpportunityCreated },
					{ event: InngestEvents.OpportunityFollowupReceived }
				],
				retries: 3
			},
			async ({ event, runId }) => {
				const data = event.data as
					| { opportunityId?: unknown; organizationId?: unknown; triggeredBy?: unknown }
					| undefined;
				const opportunityId = typeof data?.opportunityId === 'string' ? data.opportunityId : null;
				const organizationId = typeof data?.organizationId === 'string' ? data.organizationId : null;
				const triggeredBy = data?.triggeredBy === 'owner_compose' ? 'owner_compose' : 'customer_reply';

				if (!opportunityId) {
					logService.logAction({
						action: 'inngest.event.invalid_payload',
						message: `${event.name} event missing opportunityId`,
						metadata: { event: event.name, payload: event.data },
						level: 'warn',
						context: 'InngestFn:reply-draft-generate'
					});
					return { skipped: true };
				}

				const correlation: { requestId: string; organizationId?: string } = {
					requestId: runId,
					...(organizationId ? { organizationId } : {})
				};

				const isFollowup = event.name === InngestEvents.OpportunityFollowupReceived;
				const result = await requestContext.run(correlation, () =>
					isFollowup
						? // Follow-up path: always creates a new draft. The caller (customer-reply
							// pipeline or owner-compose endpoint) is the trigger; no user-id is
							// carried on the customer-reply event, so the org OWNER's voice is used
							// (matches the W5.3 initial-generation default).
							replyDrafts.generateFollowupDraft(opportunityId, null, triggeredBy)
						: replyDrafts.upsertFromOpportunity(opportunityId)
				);

				return { opportunityId, event: event.name, ...result };
			}
		);

		// Reference the constant so a future split into multiple steps doesn't break the
		// import. Inngest doesn't require named steps unless you actually call step.run.
		void InngestSteps.ReplyDraftGenerate.Generate;
	}
}
