import { ExpiryActionKind } from '@/generated/prisma/enums';
import { EXPIRY_ACTION_ALREADY_RESOLVED, EXPIRY_ACTION_NOT_FOUND } from '@/lib/errors';
import { AI_CLIENT, type AIClient } from '@/modules/ai/clients/ai-client.interface';
import { logContext as requestContext } from '@/modules/logger/log-context';
import { LogService } from '@/modules/logger/log.service';
import { OpportunitiesService } from '@/modules/opportunities/opportunities.service';
import { ReplyDraftsService } from '@/modules/reply-drafts/reply-drafts.service';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ExpiryRepository, type ExpiryActionRecord } from '@/modules/expiry/expiry.repository';
import { buildExpirySuggestionPromptNL } from '@/modules/expiry/expiry-suggestion.prompt';
import { expirySuggestionSchema } from '@/modules/expiry/expiry-suggestion.types';

/**
 * Smart-expiry orchestration. The watcher (`runWatcher`) is driven by the W13 cron:
 * it enumerates SENT quotes drifting toward expiry without a customer reply (the
 * repository's candidate gate is the idempotency root + the unique-insert backstop)
 * and turns each into an AI-suggested `ExpiryAction`. The owner then resolves a
 * suggestion via `takeAction` (one of three kinds) or `dismiss`.
 *
 * The service never reinvents generators: `LAST_FOLLOWUP` reuses
 * `ReplyDraftsService.generateFollowupDraft` and `MARK_LOST` reuses
 * `OpportunitiesService.updateStatus`, so each path inherits the existing audit +
 * timeline writes.
 */
@Injectable()
export class ExpiryService {
	constructor(
		private readonly repository: ExpiryRepository,
		@Inject(AI_CLIENT) private readonly ai: AIClient,
		private readonly replyDrafts: ReplyDraftsService,
		private readonly opportunities: OpportunitiesService,
		private readonly logService: LogService
	) {}

	/**
	 * Scan expiry candidates and persist one AI suggestion per candidate. Per-candidate
	 * AsyncLocalStorage re-entry (CLAUDE.md #8) so the AICall + Log rows the generate()
	 * call produces carry the candidate's `organizationId` — without it they'd land with
	 * the cron's request-context defaults. Each candidate is wrapped in try/catch so one
	 * failure (AI error, persist hiccup) skips that row without aborting the loop; the
	 * row re-qualifies on the next tick because no suggestion was inserted.
	 */
	async runWatcher(
		now: Date = new Date(),
		correlation: { requestId?: string } = {}
	): Promise<{ scanned: number; inserted: number }> {
		const candidates = await this.repository.findExpiryCandidates(now);
		let inserted = 0;

		// `requestId` is always present on a LogContext; fall back to a fresh UUID when the
		// caller (cron / test) didn't supply one so the per-candidate rows stay correlatable.
		const requestId = correlation.requestId ?? randomUUID();

		for (const candidate of candidates) {
			const context = { requestId, organizationId: candidate.organizationId };

			const didInsert = await requestContext.run(context, async () => {
				try {
					const result = await this.ai.generate({
						purpose: 'expiry-suggestion',
						prompt: buildExpirySuggestionPromptNL({
							customerName: candidate.customerName,
							requestType: candidate.requestType,
							daysUntilExpiry: candidate.daysUntilExpiry,
							lastCustomerMessage: candidate.lastCustomerMessage
						}),
						schema: expirySuggestionSchema
					});

					await this.repository.insertSuggestion({
						organizationId: candidate.organizationId,
						opportunityId: candidate.opportunityId,
						quoteDraftId: candidate.quoteDraftId,
						validUntil: candidate.validUntil,
						recommendedAction: result.value.recommendedAction,
						suggestedCopy: result.value.suggestedCopy,
						aiCallId: result.callId
					});
					return true;
				} catch (error) {
					this.logService.logAction({
						action: 'expiry.watcher.suggestion_failed',
						message: `Failed to generate expiry suggestion for opportunity ${candidate.opportunityId}: ${
							error instanceof Error ? error.message : String(error)
						}`,
						metadata: { opportunityId: candidate.opportunityId, quoteDraftId: candidate.quoteDraftId },
						level: 'warn',
						context: 'ExpiryService'
					});
					return false;
				}
			});

			if (didInsert) {
				inserted += 1;
			}
		}

		return { scanned: candidates.length, inserted };
	}

	/** The live (SUGGESTED) suggestion for an opportunity in this org, or `null`. */
	async getForOpportunity(opportunityId: string, organizationId: string): Promise<ExpiryActionRecord | null> {
		// W13 is an entitled-only feature. Gate the read gracefully: non-entitled orgs get
		// no card (rather than a 402) so the opportunity detail renders without the feature.
		if (!(await this.repository.isOrganizationEntitled(organizationId))) {
			return null;
		}

		return this.repository.findLiveForOpportunity(opportunityId, organizationId);
	}

	/**
	 * Resolve a suggestion by carrying out one of the three actions. Authorizes the action
	 * against the org first (cross-tenant rows 404), then CLAIMS the SUGGESTED → TAKEN
	 * transition atomically (CLAUDE.md #26): only the winner of that conditional update
	 * runs the side-effect, so two concurrent calls can never double-apply (e.g. EXTEND
	 * twice). A lost claim means the row was already resolved → 400. After the side-effect
	 * succeeds, all sibling suggestions for the opp are superseded for EVERY kind.
	 */
	async takeAction(
		actionId: string,
		organizationId: string,
		userId: string,
		kind: ExpiryActionKind
	): Promise<void> {
		const action = await this.repository.findForAuthorization(actionId, organizationId);
		if (!action) {
			throw new NotFoundException(EXPIRY_ACTION_NOT_FOUND);
		}

		const claimed = await this.repository.claimAsTaken(actionId, kind, userId);
		if (!claimed) {
			throw new BadRequestException(EXPIRY_ACTION_ALREADY_RESOLVED);
		}

		switch (kind) {
			case ExpiryActionKind.EXTEND_14D: {
				await this.repository.extendValidUntil(action.quoteDraftId);
				this.logService.logAction({
					action: 'expiry.action.extended',
					message: `Extended quote validity 14 days for opportunity ${action.opportunityId} by user ${userId}`,
					metadata: { opportunityId: action.opportunityId, expiryActionId: actionId, actorUserId: userId },
					context: 'ExpiryService'
				});
				break;
			}
			case ExpiryActionKind.LAST_FOLLOWUP: {
				await this.replyDrafts.generateFollowupDraft(action.opportunityId, userId, 'owner_compose');
				this.logService.logAction({
					action: 'expiry.action.last_followup',
					message: `Composed a last follow-up draft for opportunity ${action.opportunityId} by user ${userId}`,
					metadata: { opportunityId: action.opportunityId, expiryActionId: actionId, actorUserId: userId },
					context: 'ExpiryService'
				});
				break;
			}
			case ExpiryActionKind.MARK_LOST: {
				await this.opportunities.updateStatus(organizationId, action.opportunityId, 'lost', userId);
				this.logService.logAction({
					action: 'expiry.action.mark_lost',
					message: `Marked opportunity ${action.opportunityId} as lost via expiry action by user ${userId}`,
					metadata: { opportunityId: action.opportunityId, expiryActionId: actionId, actorUserId: userId },
					context: 'ExpiryService'
				});
				break;
			}
		}

		// Clear sibling suggestions for this opp regardless of kind — the action we just
		// took resolves the window, so any other live suggestion is now stale.
		await this.repository.markSupersededForOpportunity(action.opportunityId, actionId);
	}

	/**
	 * Dismiss a suggestion without acting on it. Authorizes against the org first, then
	 * CLAIMS the SUGGESTED → DISMISSED transition atomically — a lost claim (already taken
	 * or dismissed by a concurrent call) is a 400, closing the dismiss-vs-take race.
	 */
	async dismiss(actionId: string, organizationId: string, userId: string): Promise<void> {
		const action = await this.repository.findForAuthorization(actionId, organizationId);
		if (!action) {
			throw new NotFoundException(EXPIRY_ACTION_NOT_FOUND);
		}

		const claimed = await this.repository.claimAsDismissed(actionId);
		if (!claimed) {
			throw new BadRequestException(EXPIRY_ACTION_ALREADY_RESOLVED);
		}

		this.logService.logAction({
			action: 'expiry.action.dismissed',
			message: `Dismissed expiry suggestion for opportunity ${action.opportunityId} by user ${userId}`,
			metadata: { opportunityId: action.opportunityId, expiryActionId: actionId, actorUserId: userId },
			context: 'ExpiryService'
		});
	}
}
