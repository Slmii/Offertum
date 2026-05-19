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
 * W5.3 — listens for `opportunity/created` events emitted by the opportunities pipeline
 * after a new `Opportunity` row is persisted, and generates the AI reply draft.
 *
 * Idempotency: the `ReplyDraft.opportunityId @unique` constraint + `createMany` /
 * `skipDuplicates: true` in `ReplyDraftsRepository.createIfAbsent` make this function
 * retry-safe. Inngest's per-function retry budget covers transient OpenAI hiccups.
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
				triggers: [{ event: InngestEvents.OpportunityCreated }],
				retries: 3
			},
			async ({ event, runId }) => {
				const data = event.data as { opportunityId?: unknown; organizationId?: unknown } | undefined;
				const opportunityId = typeof data?.opportunityId === 'string' ? data.opportunityId : null;
				const organizationId = typeof data?.organizationId === 'string' ? data.organizationId : null;

				if (!opportunityId) {
					logService.logAction({
						action: 'inngest.event.invalid_payload',
						message: `${InngestEvents.OpportunityCreated} event missing opportunityId`,
						metadata: { event: InngestEvents.OpportunityCreated, payload: event.data },
						level: 'warn',
						context: 'InngestFn:reply-draft-generate'
					});
					return { skipped: true };
				}

				const correlation: { requestId: string; organizationId?: string } = {
					requestId: runId,
					...(organizationId ? { organizationId } : {})
				};

				// Wrapping the service call in `requestContext.run` propagates the
				// correlation into every `AICall` / `Log` row the generator produces. There's
				// only one step in this function (no chained `step.run` calls), but the wrap
				// stays here to preserve the pattern for any future expansion.
				const result = await requestContext.run(correlation, () =>
					replyDrafts.upsertFromOpportunity(opportunityId)
				);

				return { opportunityId, ...result };
			}
		);

		// Reference the constant so a future split into multiple steps doesn't break the
		// import. Inngest doesn't require named steps unless you actually call step.run.
		void InngestSteps.ReplyDraftGenerate.Generate;
	}
}
