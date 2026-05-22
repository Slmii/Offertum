import { inngest } from '@/modules/inngest/inngest.client';
import { InngestEvents, InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { logContext as requestContext } from '@/modules/logger/log-context';
import { LogService } from '@/modules/logger/log.service';
import { ReplyDraftsService } from '@/modules/reply-drafts/reply-drafts.service';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

/**
 * W6.1 — Per-opportunity processor for the silence-check-in fan-out.
 *
 * Receives `opportunity/silence.followup-due` events from `FollowUpSchedulerFunction`.
 * Each event maps 1:1 to a single opportunity. The processor re-validates eligibility
 * (cap / cadence / latest-draft-status) inside `generateCheckInDraft` before spending
 * an OpenAI call, so a race between the scheduler tick and this run (owner sent a
 * fresh draft, customer replied, etc.) skips cleanly instead of producing a stale or
 * duplicate check-in.
 *
 * `concurrency` cap of 5 keeps OpenAI usage predictable during a large fan-out tick —
 * 500 candidates × full parallelism would spike RPM. Five-at-a-time means a worst-
 * case 500-candidate org takes ~100 × generation-latency to drain, which is fine for
 * a daily batch.
 *
 * AsyncLocalStorage: re-established INSIDE the step.run per the same pattern as
 * `ReplyDraftGenerateFunction` so the AICall + Log rows produced by the generator
 * carry the correct `requestId` + `organizationId`.
 */
@Injectable()
export class FollowUpProcessorFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(replyDrafts: ReplyDraftsService, logService: LogService) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.FollowUpProcessor,
				name: 'Follow-up processor',
				triggers: [{ event: InngestEvents.OpportunitySilenceFollowupDue }],
				retries: 3,
				concurrency: { limit: 5 }
			},
			async ({ event, runId, step }) => {
				const data = event.data as { opportunityId?: unknown; organizationId?: unknown } | undefined;
				const opportunityId = typeof data?.opportunityId === 'string' ? data.opportunityId : null;
				const organizationId = typeof data?.organizationId === 'string' ? data.organizationId : null;

				if (!opportunityId) {
					logService.logAction({
						action: 'inngest.event.invalid_payload',
						message: `${event.name} event missing opportunityId`,
						metadata: { event: event.name, payload: event.data },
						level: 'warn',
						context: 'InngestFn:follow-up-processor'
					});
					return { skipped: true };
				}

				const correlation: { requestId: string; organizationId?: string } = {
					requestId: runId,
					...(organizationId ? { organizationId } : {})
				};

				const result = await step.run(InngestSteps.FollowUpProcessor.Generate, () =>
					requestContext.run(correlation, () => replyDrafts.generateCheckInDraft(opportunityId))
				);

				return { opportunityId, ...result };
			}
		);
	}
}
