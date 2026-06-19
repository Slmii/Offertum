import type { EnvSchema } from '@/config/env.schema';
import {
	NotificationEventType as PrismaNotificationEventType,
	OpportunityStatus as PrismaOpportunityStatus,
	ReplyDraftKind as PrismaReplyDraftKind,
	ReplyDraftStatus as PrismaReplyDraftStatus
} from '@/generated/prisma/enums';
import { detectBulkMail } from '@/lib/email/bulk-mail-filter';
import { buildRawMessageAIInput } from '@/lib/email/raw-message-ai-input';
import {
	OPPORTUNITY_ASSIGNEE_NOT_IN_ORG,
	OPPORTUNITY_NOT_DISMISSED,
	OPPORTUNITY_NOT_FOUND,
	REPLY_DRAFT_ALREADY_SENT,
	REPLY_DRAFT_CANNOT_SEND,
	REPLY_DRAFT_LOCKED,
	REPLY_DRAFT_NOT_FOUND
} from '@/lib/errors';
import { buildCustomerReplyEmail } from '@/lib/mails/notifications/customer-reply.email';
import { buildOpportunityCreatedEmail } from '@/lib/mails/notifications/opportunity-created.email';
import { ClassifierService } from '@/modules/ai/classifier/classifier.service';
import { AINotConfiguredError } from '@/modules/ai/clients/ai-client.interface';
import { ExtractorService } from '@/modules/ai/extractor/extractor.service';
import { ShouldReplyClassifier } from '@/modules/ai/should-reply/should-reply.service';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestEvents } from '@/modules/inngest/inngest.constants';
import { LogService } from '@/modules/logger/log.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
	OpportunityDetailResponseDto,
	ReplyDraftResponseDto
} from '@/modules/opportunities/dto/opportunity-detail.response.dto';
import { OpportunityListResponseDto } from '@/modules/opportunities/dto/opportunity-list.response.dto';
import { OpportunityResponseDto } from '@/modules/opportunities/dto/opportunity.response.dto';
import type { UpdateOpportunityFieldsDto } from '@/modules/opportunities/dto/update-opportunity-fields.dto';
import {
	MAX_CLASSIFY_ATTEMPTS,
	OpportunitiesRepository,
	type OpportunityDetailRecord,
	type OpportunityDismissedFilter,
	type OpportunityRecord,
	type RawMessageForOpportunityProcessing
} from '@/modules/opportunities/opportunities.repository';
import type {
	OpportunityProcessingBatchResult,
	OpportunityProcessingResult
} from '@/modules/opportunities/opportunities.types';
import {
	OPPORTUNITY_DISMISS_REASON_FROM_WIRE,
	OPPORTUNITY_DISMISS_REASON_TO_WIRE
} from '@/modules/opportunities/opportunity-dismiss-reason.mapper';
import {
	decodeOpportunityListCursor,
	encodeOpportunityListCursor
} from '@/modules/opportunities/opportunity-list-cursor';
import {
	OPPORTUNITY_STATUS_FROM_WIRE,
	OPPORTUNITY_STATUS_TO_WIRE
} from '@/modules/opportunities/opportunity-status.mapper';
import {
	OPPORTUNITY_URGENCY_FROM_WIRE,
	OPPORTUNITY_URGENCY_TO_WIRE
} from '@/modules/opportunities/opportunity-urgency.mapper';
import { isReplyDraftEditable } from '@/modules/opportunities/reply-draft-editability';
import { REPLY_DRAFT_STATUS_TO_WIRE } from '@/modules/opportunities/reply-draft-status.mapper';
import { ReplyDraftsService } from '@/modules/reply-drafts/reply-drafts.service';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
	OpportunityActivityKind,
	OpportunityAssigneeFilter,
	OpportunityFieldChange,
	OpportunityMailboxOwnershipFilter,
	OpportunityTimelineEvent,
	OpportunityDismissReason as WireDismissReason,
	OpportunityStatus as WireOpportunityStatus,
	OpportunityUrgency as WireOpportunityUrgency
} from '@offertum/shared';

// Soft cap on rows scanned per Inngest `step.run` invocation. The cap is sized so that
// even at the upper end of provider latency (≈2 s/classification + ≈3 s/extraction on a
// long body) a single step finishes within Inngest's 5-minute step timeout, with margin.
// The opportunities pipeline scales horizontally by chunking through the Inngest function
// loop (see `gmail-backfill.function.ts` et al.) — each batch runs as its own resumable
// `step.run`, so a backfill that scans hundreds of rows survives partial failures and
// per-step retries without losing prior progress.
const PROCESS_BATCH_SIZE = 25;

// In-batch parallelism for the classify-then-extract work. Picked to stay well under
// gpt-4o's 30k-TPM default tier: the extractor burns ~2k tokens/call, so 5 concurrent
// extractions ≈ 10k tokens in flight — safe with margin for the SDK's retries. Higher
// values are faster but risk 429s the SDK can't ride through. Lower values are slower
// but never matter — we'd just be the limit instead of OpenAI.
const PROCESS_BATCH_CONCURRENCY = 5;

const LIST_DEFAULT_PAGE_SIZE = 25;
const LIST_MAX_PAGE_SIZE = 100;

/**
 * Caller-supplied context for the opportunities pipeline. Drives two
 * runtime choices:
 *  - `'backfill'`: first-time ingest of a mailbox. Multi-message threads use the
 *    *thread-as-unit* flow (classify newest-first, anchor opp to first positive,
 *    attach the rest as history). `OpportunityFollowupReceived` events are SUPPRESSED
 *    so a 5-message thread doesn't produce 5 stacked drafts.
 *  - `'live'`: an incoming delta-sync push from the provider. Single-message-per-batch
 *    is the norm. Thread reconstitution fires `OpportunityFollowupReceived` so a fresh
 *    draft is generated against the latest customer reply.
 */
export type PipelineMode = 'backfill' | 'live';

interface ProcessBatchOptions {
	mode: PipelineMode;
}

const DEFAULT_PROCESS_OPTIONS: ProcessBatchOptions = { mode: 'live' };

@Injectable()
export class OpportunitiesService {
	constructor(
		private readonly repository: OpportunitiesRepository,
		private readonly classifier: ClassifierService,
		private readonly extractor: ExtractorService,
		private readonly config: ConfigService<EnvSchema, true>,
		private readonly logService: LogService,
		private readonly replyDrafts: ReplyDraftsService,
		private readonly notifications: NotificationsService,
		private readonly shouldReply: ShouldReplyClassifier
	) {}

	/**
	 * Resolve `Organization.id` from `EmailAccount.id`. Used by the Inngest pipeline
	 * scaffolding to populate `logContext.organizationId` before any AI/log call inside
	 * a worker run — otherwise `AICall`/`Log` rows from background jobs land with NULL
	 * `organizationId` (the AsyncLocalStorage context is only set by HTTP middleware).
	 */
	resolveOrganizationIdForEmailAccount(emailAccountId: string): Promise<string | null> {
		return this.repository.findOrganizationIdForEmailAccount(emailAccountId);
	}

	async list(
		organizationId: string,
		options: {
			cursor: string | null;
			limit: number | null;
			status: WireOpportunityStatus | null;
			search: string | null;
			dismissed: OpportunityDismissedFilter | null;
			owner: OpportunityMailboxOwnershipFilter | null;
			assignee: OpportunityAssigneeFilter | null;
			/** Required when owner=mine or assignee=me; resolved from the auth context
			 * in the controller. `null` falls back to no-op for those filters. */
			requestingUserId: string | null;
		} = {
			cursor: null,
			limit: null,
			status: null,
			search: null,
			dismissed: null,
			owner: null,
			assignee: null,
			requestingUserId: null
		}
	): Promise<OpportunityListResponseDto> {
		const limit = clampLimit(options.limit);
		const decodedCursor = decodeOpportunityListCursor(options.cursor);
		const statusFilter = options.status ? OPPORTUNITY_STATUS_FROM_WIRE[options.status] : null;
		const dismissedFilter = options.dismissed ?? 'active';

		// "Mine" / "me" filters only kick in when there's an authenticated user. Anon
		// requests (shouldn't reach this endpoint, but defensive) get no-op'd to `all`.
		const ownerFilter =
			options.owner === 'mine' && options.requestingUserId ? { userId: options.requestingUserId } : null;
		const assigneeFilter =
			options.assignee === 'me' && options.requestingUserId
				? ({ kind: 'user', userId: options.requestingUserId } as const)
				: options.assignee === 'unassigned'
					? ({ kind: 'unassigned' } as const)
					: null;

		// Over-fetch by one row to detect a next page without a follow-up count query.
		// `statusCounts` runs in parallel so the segmented filter tabs render with their
		// (N) numbers without a second round-trip from the web. Counts respect the same
		// owner + assignee filters so the tab totals match the visible rows.
		const [rows, statusCounts] = await Promise.all([
			this.repository.listByOrganization(organizationId, {
				take: limit + 1,
				cursor: decodedCursor,
				status: statusFilter,
				search: options.search,
				dismissed: dismissedFilter,
				owner: ownerFilter,
				assignee: assigneeFilter
			}),
			this.repository.countByStatusForOrganization(organizationId, {
				owner: ownerFilter,
				assignee: assigneeFilter
			})
		]);

		const hasMore = rows.length > limit;
		const page = hasMore ? rows.slice(0, limit) : rows;
		const last = page[page.length - 1];
		const nextCursor =
			hasMore && last ? encodeOpportunityListCursor({ createdAt: last.createdAt, id: last.id }) : null;

		// Resolve the "last activity" badge for each row. Batched queries (latest editor per
		// opp + user labels + org email set) so the list endpoint stays O(1) DB round-trips
		// regardless of page size. The org email set distinguishes customer-side thread
		// messages from own-org outbound (self-emails).
		const [editorMap, orgEmailAddresses] = await Promise.all([
			this.repository.findLatestEditorPerOpportunity(organizationId, page.map(r => r.id)),
			this.repository.findOrganizationEmailAddresses(organizationId)
		]);
		const actorIds = new Set<string>();
		for (const e of editorMap.values()) {
			actorIds.add(e.actorUserId);
		}
		const actorLabels =
			actorIds.size > 0
				? await this.repository.findUserDisplayLabels(Array.from(actorIds))
				: new Map<string, string>();

		return {
			opportunities: page.map(row => {
				const dto = toOpportunityResponseDto(row);

				// Customer-side thread messages = inbound (not from one of our own mailboxes).
				// `threadMessages` is already `internalDate DESC`, so `[0]` is the newest reply.
				const customerMessages = row.threadMessages.filter(
					m => m.fromEmail === null || !orgEmailAddresses.has(m.fromEmail.toLowerCase())
				);
				dto.customerReplyCount = customerMessages.length;

				// Pick the most recent of: owner edit (audit log), newest customer reply, and a
				// pending Offertum check-in. Whichever timestamp is latest wins the badge.
				const candidates: Array<{ kind: OpportunityActivityKind; label: string; at: Date }> = [];
				const editor = editorMap.get(row.id);
				if (editor) {
					candidates.push({ kind: 'user', label: actorLabels.get(editor.actorUserId) ?? 'Onbekend', at: editor.at });
				}
				const newestCustomer = customerMessages[0];
				if (newestCustomer) {
					candidates.push({
						kind: 'customer',
						label: `${newestCustomer.fromName ?? 'Klant'} (klant)`,
						at: newestCustomer.internalDate
					});
				}
				if (dto.hasPendingCheckIn && row.replyDrafts[0]) {
					candidates.push({ kind: 'system', label: 'Offertum', at: row.replyDrafts[0].createdAt });
				}
				const latest = candidates.reduce<(typeof candidates)[number] | null>(
					(best, current) => (best === null || current.at > best.at ? current : best),
					null
				);
				dto.lastActivity = latest ? { kind: latest.kind, label: latest.label, at: latest.at.toISOString() } : null;

				return dto;
			}),
			nextCursor,
			statusCounts: {
				new: statusCounts[PrismaOpportunityStatus.NEW],
				replied: statusCounts[PrismaOpportunityStatus.REPLIED],
				waiting: statusCounts[PrismaOpportunityStatus.WAITING],
				cold: statusCounts[PrismaOpportunityStatus.COLD],
				won: statusCounts[PrismaOpportunityStatus.WON],
				lost: statusCounts[PrismaOpportunityStatus.LOST]
			}
		};
	}

	/**
	 * Patch the owner-editable extracted fields (urgency, address, customerDeadline,
	 * customerAppointment). Workflow-status, dismiss, and reply-draft mutations have
	 * their own dedicated endpoints. No editability lock here — these are workflow-
	 * tracking fields the owner may need to correct at any time, including on closed
	 * (WON/LOST) opportunities. The audit log records each changed key + before/after
	 * for the year-2 extractor-improvement story ("which fields do owners correct?").
	 */
	async updateFields(
		organizationId: string,
		opportunityId: string,
		patch: UpdateOpportunityFieldsDto,
		actorUserId: string
	): Promise<OpportunityResponseDto> {
		const opportunity = await this.repository.findByIdForOrganization(organizationId, opportunityId);
		if (!opportunity) {
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}

		// Normalize the wire payload into the Prisma write shape. We trim + null-empty
		// strings here so the DB doesn't end up with " " or "" — owners clearing a field
		// expect NULL semantics, not whitespace.
		const writePatch: Parameters<typeof this.repository.updateEditableFields>[1] = {};
		const changedKeys: string[] = [];
		const beforeAfter: Record<string, { before: unknown; after: unknown }> = {};

		if (patch.urgency !== undefined) {
			const next = OPPORTUNITY_URGENCY_FROM_WIRE[patch.urgency];
			if (next !== opportunity.urgency) {
				writePatch.urgency = next;
				changedKeys.push('urgency');
				beforeAfter.urgency = {
					before: OPPORTUNITY_URGENCY_TO_WIRE[opportunity.urgency],
					after: patch.urgency
				};
			}
		}
		if (patch.address !== undefined) {
			const next = patch.address === null ? null : patch.address.trim() || null;
			if (next !== opportunity.address) {
				writePatch.address = next;
				changedKeys.push('address');
				beforeAfter.address = { before: opportunity.address, after: next };
			}
		}
		if (patch.customerDeadline !== undefined) {
			const next = patch.customerDeadline === null ? null : new Date(patch.customerDeadline);
			const same =
				(next === null && opportunity.customerDeadline === null) ||
				(next !== null &&
					opportunity.customerDeadline !== null &&
					next.getTime() === opportunity.customerDeadline.getTime());
			if (!same) {
				writePatch.customerDeadline = next;
				changedKeys.push('customerDeadline');
				beforeAfter.customerDeadline = {
					before: opportunity.customerDeadline?.toISOString() ?? null,
					after: next?.toISOString() ?? null
				};
			}
		}
		if (patch.customerAppointment !== undefined) {
			const next = patch.customerAppointment === null ? null : new Date(patch.customerAppointment);
			const same =
				(next === null && opportunity.customerAppointment === null) ||
				(next !== null &&
					opportunity.customerAppointment !== null &&
					next.getTime() === opportunity.customerAppointment.getTime());
			if (!same) {
				writePatch.customerAppointment = next;
				changedKeys.push('customerAppointment');
				beforeAfter.customerAppointment = {
					before: opportunity.customerAppointment?.toISOString() ?? null,
					after: next?.toISOString() ?? null
				};
			}
		}

		if (changedKeys.length === 0) {
			// No-op: caller sent the same values the row already has.
			return toOpportunityResponseDto(opportunity);
		}

		const updated = await this.repository.updateEditableFields(opportunityId, writePatch);

		this.logService.logAction({
			action: 'opportunity.fields_updated',
			message: `Opportunity ${opportunityId} fields updated (${changedKeys.join(', ')}) by user ${actorUserId}`,
			metadata: {
				organizationId,
				opportunityId,
				actorUserId,
				changedKeys,
				diff: beforeAfter,
				extractedAiCallId: opportunity.extractedAiCallId ?? null
			},
			context: 'OpportunitiesService'
		});

		return toOpportunityResponseDto(updated);
	}

	async updateStatus(
		organizationId: string,
		opportunityId: string,
		status: WireOpportunityStatus,
		actorUserId: string
	): Promise<OpportunityResponseDto> {
		const opportunity = await this.repository.findByIdForOrganization(organizationId, opportunityId);
		if (!opportunity) {
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}

		const nextStatus = OPPORTUNITY_STATUS_FROM_WIRE[status];
		// Same-status no-op short-circuits the DB write. Any other transition is allowed
		// (the previous restricted policy was removed — see commit history). Reintroduce
		// a gate here if a future "soft-blocked transitions for analytics" rule lands.
		if (opportunity.status === nextStatus) {
			return toOpportunityResponseDto(opportunity);
		}

		const previousStatus = OPPORTUNITY_STATUS_TO_WIRE[opportunity.status];
		const updated = await this.repository.updateStatus(opportunity.id, nextStatus);

		this.logService.logAction({
			action: 'opportunity.status.updated',
			message: `Opportunity ${opportunity.id} status ${previousStatus} → ${status} by user ${actorUserId}`,
			metadata: {
				organizationId,
				opportunityId: opportunity.id,
				previousStatus,
				nextStatus: status,
				actorUserId
			},
			context: 'OpportunitiesService'
		});

		return toOpportunityResponseDto(updated);
	}

	/**
	 * Soft-disable an opportunity. Reason becomes a feedback signal for the
	 * classifier (`NOT_A_QUOTE`) or for the bulk-mail filter (`SPAM`). Audit-log
	 * breadcrumb records the actor, reason, before/after, and optional free-text
	 * notes so the row stays auditable even though we don't persist notes on the
	 * row itself. Owners can dismiss already-WON rows (see spec — uncommon
	 * but valid: they realise the original email wasn't really an offerteaanvraag
	 * after the fact); the breadcrumb flags it so the precision metric can ignore.
	 */
	async dismiss(
		organizationId: string,
		opportunityId: string,
		reason: WireDismissReason,
		actorUserId: string,
		notes: string | null
	): Promise<OpportunityResponseDto> {
		const opportunity = await this.repository.findByIdForOrganization(organizationId, opportunityId);
		if (!opportunity) {
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}

		const prismaReason = OPPORTUNITY_DISMISS_REASON_FROM_WIRE[reason];
		const previousReason = opportunity.dismissReason
			? OPPORTUNITY_DISMISS_REASON_TO_WIRE[opportunity.dismissReason]
			: null;

		// Idempotency at the wire level: re-dismissing with the same reason still bumps
		// `dismissedAt` (so the audit timeline reflects the latest decision) but is
		// otherwise a no-op-equivalent — no error to the caller.
		const updated = await this.repository.dismiss(opportunity.id, prismaReason, actorUserId);

		this.logService.logAction({
			action: 'opportunity.dismissed',
			message: `Opportunity ${opportunity.id} dismissed (${reason}) by user ${actorUserId}`,
			metadata: {
				organizationId,
				opportunityId: opportunity.id,
				reason,
				previousReason,
				previousStatus: OPPORTUNITY_STATUS_TO_WIRE[opportunity.status],
				notes: notes ?? null,
				actorUserId,
				classifiedAiCallId: opportunity.classifiedAiCallId ?? null,
				//  follow-up — separates "caught quickly" from "caught after work was
				// done." A `dismissedAfterSend: true` row is a more costly false-positive:
				// the customer received an irrelevant reply before the classifier mistake
				// was caught. `/admin/classifier-quality` can split precision metrics by
				// this axis to surface the costlier mistakes.
				// `replyDrafts` is 1:N. Any historical SENT draft sticks the flag on,
				// even after a follow-up draft has been composed on top.
				dismissedAfterSend: opportunity.replyDrafts.some(d => d.sentAt !== null)
			},
			context: 'OpportunitiesService'
		});

		return toOpportunityResponseDto(updated);
	}

	/**
	 * Reverse a dismiss. Returns 409 if the row wasn't dismissed in the first
	 * place so the FE can swallow duplicate clicks without surfacing a 4xx toast.
	 */
	async undismiss(
		organizationId: string,
		opportunityId: string,
		actorUserId: string
	): Promise<OpportunityResponseDto> {
		const opportunity = await this.repository.findByIdForOrganization(organizationId, opportunityId);
		if (!opportunity) {
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}

		if (!opportunity.dismissedAt) {
			throw new ConflictException(OPPORTUNITY_NOT_DISMISSED);
		}

		const previousReason = opportunity.dismissReason
			? OPPORTUNITY_DISMISS_REASON_TO_WIRE[opportunity.dismissReason]
			: null;

		const updated = await this.repository.undismiss(opportunity.id);

		this.logService.logAction({
			action: 'opportunity.undismissed',
			message: `Opportunity ${opportunity.id} un-dismissed by user ${actorUserId}`,
			metadata: {
				organizationId,
				opportunityId: opportunity.id,
				previousReason,
				actorUserId
			},
			context: 'OpportunitiesService'
		});

		return toOpportunityResponseDto(updated);
	}

	/**
	 * Assign or unassign an opportunity. `userId === null` clears the assignment back
	 * to "anyone". Cross-org assignments are rejected (the new assignee must be a
	 * member of the opp's org). Audit log captures both before and after assignee +
	 * actor for the timeline panel + the "last edited by" badge.
	 */
	/**
	 * Write an `opportunity.received_via_mailbox` audit row at creation time. The
	 * mailbox-owner default-assignment still happens on the column (`assignedToUserId`
	 * is set in the repo's create transaction); we don't write a separate "assigned"
	 * row for it because the picker already shows the same info. This audit row tells
	 * the owner WHICH inbox produced the opp when multiple are connected — informational
	 * context, not a workflow event.
	 */
	private logReceivedViaMailbox(
		opportunityId: string,
		organizationId: string,
		mailbox: { email: string; userId: string | null; ownerName: string | null },
		originating: { rawMessageId: string; internalDate: Date }
	): void {
		this.logService.logAction({
			action: 'opportunity.received_via_mailbox',
			message: `Opportunity ${opportunityId} received via mailbox ${mailbox.email}`,
			metadata: {
				organizationId,
				opportunityId,
				mailboxEmail: mailbox.email,
				mailboxOwnerUserId: mailbox.userId,
				mailboxOwnerName: mailbox.ownerName,
				// Originating-message arrival time. The timeline mapper prefers this over
				// `Log.createdAt` so the "Binnengekomen" event shows when the customer
				// actually emailed, not when the backfill/sync wrote the row.
				originatingRawMessageId: originating.rawMessageId,
				originatingInternalDate: originating.internalDate.toISOString()
			},
			context: 'OpportunitiesService'
		});
	}

	async assignOpportunity(
		organizationId: string,
		opportunityId: string,
		userId: string | null,
		actorUserId: string
	): Promise<OpportunityResponseDto> {
		const opportunity = await this.repository.findByIdForOrganization(organizationId, opportunityId);
		if (!opportunity) {
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}

		if (userId !== null) {
			const isMember = await this.repository.isUserMemberOfOrganization(userId, organizationId);
			if (!isMember) {
				throw new NotFoundException(OPPORTUNITY_ASSIGNEE_NOT_IN_ORG);
			}
		}

		if (opportunity.assignedToUserId === userId) {
			// No-op short-circuit so the audit log doesn't fill up with "assigned X → X"
			// rows from clients that fire the same payload repeatedly.
			return toOpportunityResponseDto(opportunity);
		}

		const previousAssigneeUserId = opportunity.assignedToUserId;
		const updated = await this.repository.assignOpportunity(opportunity.id, userId);

		this.logService.logAction({
			action: 'opportunity.assigned',
			message: `Opportunity ${opportunity.id} assigned ${previousAssigneeUserId ?? 'unassigned'} → ${userId ?? 'unassigned'} by user ${actorUserId}`,
			metadata: {
				organizationId,
				opportunityId: opportunity.id,
				previousAssigneeUserId,
				nextAssigneeUserId: userId,
				actorUserId
			},
			context: 'OpportunitiesService'
		});

		return toOpportunityResponseDto(updated);
	}

	/**
	 * Detail-view read. Fetches the opportunity + raw provider payload + the
	 *  reply draft (if generated). The `replyDraft` field is `null` when the
	 * Inngest function hasn't completed yet (cold-start race on a freshly-created
	 * opportunity); the FE polls in that case.
	 * **Self-healing for missing drafts:** if the opportunity has no `ReplyDraft` row
	 * AND it isn't dismissed, this method re-fires the `opportunity/created` event
	 * before returning. Covers three real failure modes:
	 *  1. Opportunities created before shipped (no emit ran for them).
	 *  2. Emit succeeded but the Inngest function later failed terminally (transient
	 *     OpenAI error, AICall persist hiccup, etc.).
	 *  3. The emit itself failed at insert time (the error-handler in
	 *     `processOneRawMessage` swallows + logs but doesn't retry).
	 * Re-firing is safe: `ReplyDraft.opportunityId` is unique, and the Inngest function
	 * short-circuits if a row already exists. The fire-and-forget cost is one extra
	 * event per missed-draft detail-view open — negligible.
	 */
	async getDetail(organizationId: string, opportunityId: string): Promise<OpportunityDetailResponseDto> {
		const [opportunity, timelineRows, orgEmailAddresses] = await Promise.all([
			this.repository.findDetailByIdForOrganization(organizationId, opportunityId),
			this.repository.findTimelineEvents(organizationId, opportunityId),
			this.repository.findOrganizationEmailAddresses(organizationId)
		]);
		if (!opportunity) {
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}

		const originalEmailBody = buildRawMessageAIInput({
			provider: opportunity.rawMessage.emailAccount.provider,
			subject: opportunity.rawMessage.subject,
			fromName: opportunity.rawMessage.fromName,
			fromEmail: opportunity.rawMessage.fromEmail,
			raw: opportunity.rawMessage.raw
		}).bodyText;

		// `replyDrafts` is 1:N. Lazy-emit only when there are NO drafts at all
		// (cold-start window or pre- opportunity). When there's at least one draft,
		// the customer-reply path will fire its own follow-up event; this lazy path is
		// only for the initial-generation gap.
		if (opportunity.replyDrafts.length === 0 && !opportunity.dismissedAt) {
			void this.requestReplyDraftGeneration(opportunity.id, opportunity.organizationId);
		}

		// Collect every user ID the timeline references: actors + before/after
		// assignees on `opportunity.assigned` rows. One batched user lookup covers all.
		const referencedUserIds = new Set<string>();
		const addIfString = (value: unknown) => {
			if (typeof value === 'string') {
				referencedUserIds.add(value);
			}
		};
		for (const row of timelineRows) {
			addIfString(row.metadata.actorUserId);
			addIfString(row.metadata.previousAssigneeUserId);
			addIfString(row.metadata.nextAssigneeUserId);
		}
		const actorLabels =
			referencedUserIds.size > 0
				? await this.repository.findUserDisplayLabels(Array.from(referencedUserIds))
				: new Map<string, string>();

		const timeline = timelineRows
			.map(row => toOpportunityTimelineEvent(row, actorLabels))
			.filter((event): event is OpportunityTimelineEvent => event !== null);

		// "Aanvraag binnengekomen" should display when the customer FIRST reached out
		// on this thread — not the anchor message's date. The picker anchors on the
		// newest positive (so the draft replies to the most recent inbound), but the
		// arrival timestamp the owner wants to see is the oldest customer message in
		// the conversation. Compute that here over the originating message + every
		// inbound thread message, then patch the timeline event in place.
		const earliestCustomerArrival = computeEarliestCustomerArrival(opportunity, orgEmailAddresses);
		const adjustedTimeline = timeline.map(event =>
			event.kind === 'received_via_mailbox'
				? { ...event, occurredAt: earliestCustomerArrival.toISOString() }
				: event
		);

		return toOpportunityDetailResponseDto(opportunity, originalEmailBody, adjustedTimeline, orgEmailAddresses);
	}

	/**
	 * Fire-and-forget Inngest emit. Errors are swallowed + logged — failing to enqueue
	 * a backfill event should never break a detail-view load. The Inngest function on
	 * the other end is idempotent against the `ReplyDraft.opportunityId @unique`
	 * constraint, so duplicate emits are safe.
	 */
	private async requestReplyDraftGeneration(opportunityId: string, organizationId: string): Promise<void> {
		try {
			await inngest.send({
				name: InngestEvents.OpportunityCreated,
				data: { opportunityId, organizationId }
			});
			this.logService.logAction({
				action: 'reply_draft.lazy_regenerate_enqueued',
				message: `Lazy-emitted opportunity/created for ${opportunityId} (no ReplyDraft on detail open)`,
				metadata: { opportunityId, organizationId },
				context: 'OpportunitiesService'
			});
		} catch (error) {
			this.logService.logAction({
				action: 'reply_draft.lazy_regenerate_enqueue_failed',
				message: `Failed to lazy-emit opportunity/created for ${opportunityId}: ${error instanceof Error ? error.message : 'unknown'}`,
				metadata: { opportunityId, organizationId },
				level: 'error',
				stack: error instanceof Error ? error.stack : undefined,
				context: 'OpportunitiesService'
			});
		}
	}

	/**
	 * Regenerate the reply draft for an opportunity using the *requesting user's*
	 * `tonePlaybookText`. Powers the "Regenereer in mijn stijl" button. The service
	 * verifies the opportunity belongs to the org (cross-tenant guard) then delegates
	 * to `ReplyDraftsService.regenerate`. Returns the freshly-generated draft.
	 * Refuses to regenerate a SENT draft (409) — the email is already out.
	 */
	async regenerateReplyDraft(
		organizationId: string,
		opportunityId: string,
		requestingUserId: string
	): Promise<ReplyDraftResponseDto> {
		const opportunity = await this.repository.findByIdForOrganization(organizationId, opportunityId);
		if (!opportunity) {
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}

		if (!isReplyDraftEditable({ draftStatus: opportunity.replyDrafts[0]?.status ?? null })) {
			// SENT case still surfaces as REPLY_DRAFT_ALREADY_SENT from the service-layer
			// `regenerate` call (`overwrote: false`) — that one is friendlier copy. This
			// branch only fires when the lock comes from the OPPORTUNITY-status leg (replied
			// without sending via Offertum, won, or lost).
			throw new ConflictException(REPLY_DRAFT_LOCKED);
		}

		const result = await this.replyDrafts.regenerate(opportunityId, requestingUserId);
		if (!result.opportunityFound) {
			// Should not happen — we just verified the opportunity exists in the right
			// org. Defensive only.
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}
		if (!result.overwrote) {
			throw new ConflictException(REPLY_DRAFT_ALREADY_SENT);
		}

		const detail = await this.repository.findDetailByIdForOrganization(organizationId, opportunityId);
		const latestDraft = detail?.replyDrafts[0];
		if (!latestDraft) {
			throw new NotFoundException(REPLY_DRAFT_NOT_FOUND);
		}

		return toReplyDraftResponseDto(latestDraft);
	}

	/**
	 * Send the reply draft as a threaded email via the connected mailbox.
	 * Verifies tenant ownership of the opportunity, then delegates the heavy lifting
	 * (provider routing, OAuth token refresh, threading headers) to
	 * `ReplyDraftsService.send`. Returns the post-send draft for the editor to render
	 * the read-only "Verzonden" state.
	 * Status mapping:
	 *  - 404 → opportunity not in this org.
	 *  - 409 → draft is already SENT.
	 *  - 422 → inbox owner removed or original had no From-address.
	 */
	/**
	 * "Concept-vervolg opstellen" (compose follow-up). User-driven entry point
	 * for creating a new draft on a SENT opportunity. Generates synchronously here
	 * (rather than enqueuing the Inngest follow-up event) so the FE can read the new
	 * draft on the response — same pattern as `regenerateReplyDraft`. The endpoint:
	 *  - 404 → opportunity not in this org.
	 *  - 409 → the latest draft is NOT yet SENT (there's already an editable draft —
	 *    use that one instead of creating another).
	 *  - 200 → freshly-generated draft in the user's voice.
	 * **:** No longer touches `opp.status`. The editability rule keys off
	 * draft-state only (a brand-new PENDING_APPROVAL draft is editable regardless of
	 * opp.status), so the prior `updateStatus(NEW)` here is dead. Owners can compose a
	 * courtesy follow-up on a WON deal and the deal stays WON through send.
	 */
	async composeFollowupReplyDraft(
		organizationId: string,
		opportunityId: string,
		requestingUserId: string
	): Promise<ReplyDraftResponseDto> {
		const opportunity = await this.repository.findByIdForOrganization(organizationId, opportunityId);
		if (!opportunity) {
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}

		const latestIsSent = await this.replyDrafts.isLatestDraftSent(opportunityId);
		if (!latestIsSent) {
			// Either no draft exists yet (cold-start race — caller should retry) or a
			// non-sent draft is already in progress. Either way, no follow-up needed.
			throw new ConflictException(REPLY_DRAFT_LOCKED);
		}

		const { created } = await this.replyDrafts.generateFollowupDraft(
			opportunityId,
			requestingUserId,
			'owner_compose'
		);
		if (!created) {
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}

		this.logService.logAction({
			action: 'reply_draft.followup.owner_composed',
			message: `Owner ${requestingUserId} composed a follow-up draft on opportunity ${opportunityId}`,
			metadata: {
				organizationId,
				opportunityId,
				requestingUserId,
				opportunityStatus: OPPORTUNITY_STATUS_TO_WIRE[opportunity.status]
			},
			context: 'OpportunitiesService'
		});

		const detail = await this.repository.findDetailByIdForOrganization(organizationId, opportunityId);
		const latestDraft = detail?.replyDrafts[0];
		if (!latestDraft) {
			throw new NotFoundException(REPLY_DRAFT_NOT_FOUND);
		}
		return toReplyDraftResponseDto(latestDraft);
	}

	async sendReplyDraft(
		organizationId: string,
		opportunityId: string,
		requestingUserId: string
	): Promise<ReplyDraftResponseDto> {
		const opportunity = await this.repository.findByIdForOrganization(organizationId, opportunityId);
		if (!opportunity) {
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}

		//  follow-up — sending a draft on a `won` / `lost` / already-`replied`-without-
		// Offertum opp doesn't make sense. The SENT case still surfaces via the
		// `alreadySent: true` branch below with a more specific message.
		if (!isReplyDraftEditable({ draftStatus: opportunity.replyDrafts[0]?.status ?? null })) {
			throw new ConflictException(REPLY_DRAFT_LOCKED);
		}

		const result = await this.replyDrafts.send(opportunityId, requestingUserId);

		if (result.sent === false && result.alreadySent === true) {
			throw new ConflictException(REPLY_DRAFT_ALREADY_SENT);
		}
		if (result.sent === false && result.alreadySent === false) {
			if (result.reason === 'not_found') {
				throw new NotFoundException(REPLY_DRAFT_NOT_FOUND);
			}
			throw new ConflictException(REPLY_DRAFT_CANNOT_SEND);
		}

		const detail = await this.repository.findDetailByIdForOrganization(organizationId, opportunityId);
		const latestDraft = detail?.replyDrafts[0];
		if (!latestDraft) {
			// Shouldn't happen — the send just succeeded + the row exists. Defensive.
			throw new NotFoundException(REPLY_DRAFT_NOT_FOUND);
		}

		return toReplyDraftResponseDto(latestDraft);
	}

	/**
	 * Update the reply-draft body. Called by the autosave debounce in the editor.
	 * Idempotent: re-saving the same body is a no-op for the `wasEditedByUser` flag
	 * (only the first divergence from `originalBody` flips it). Throws 404 if the draft
	 * doesn't exist yet — caller surfaces a "draft is being prepared, retry shortly"
	 * banner in the UI.
	 */
	async updateReplyDraft(
		organizationId: string,
		opportunityId: string,
		body: string
	): Promise<ReplyDraftResponseDto> {
		const opportunity = await this.repository.findByIdForOrganization(organizationId, opportunityId);
		if (!opportunity) {
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}

		if (!isReplyDraftEditable({ draftStatus: opportunity.replyDrafts[0]?.status ?? null })) {
			throw new ConflictException(REPLY_DRAFT_LOCKED);
		}

		const updated = await this.repository.updateReplyDraftBody(opportunityId, body);
		if (!updated) {
			throw new NotFoundException(REPLY_DRAFT_NOT_FOUND);
		}

		// Re-read the full draft row so the response shape matches the GET endpoint —
		// caller's React Query cache replaces the in-memory draft from one fetch.
		const detail = await this.repository.findDetailByIdForOrganization(organizationId, opportunityId);
		const latestDraft = detail?.replyDrafts[0];
		if (!latestDraft) {
			// Should never happen — we just wrote the row. Defensive.
			throw new NotFoundException(REPLY_DRAFT_NOT_FOUND);
		}

		return toReplyDraftResponseDto(latestDraft);
	}

	/**
	 * Convenience wrapper that loops `processBatch` until the queue is exhausted. Used by
	 * unit tests + any callsite that doesn't need to interleave with Inngest's step
	 * checkpointing. **Inngest functions must use `processBatch` directly** so each batch
	 * gets its own `step.run` and the 5-minute step timeout doesn't fail a multi-hundred-
	 * message pass.
	 */
	async processRawMessagesForAccount(
		emailAccountId: string,
		options: ProcessBatchOptions = DEFAULT_PROCESS_OPTIONS
	): Promise<OpportunityProcessingResult> {
		const aggregate: OpportunityProcessingResult = {
			emailAccountId,
			scanned: 0,
			classifiedPositive: 0,
			classifiedNegative: 0,
			opportunitiesCreated: 0,
			opportunitiesSkipped: 0,
			failed: 0
		};
		const excluded = new Set<string>();

		while (true) {
			const batch = await this.processBatch(emailAccountId, [...excluded], options);
			mergeProcessingResults(aggregate, batch.result);
			for (const id of batch.failedRawMessageIds) {
				excluded.add(id);
			}
			if (batch.exhausted) {
				break;
			}
		}

		this.logService.logAction({
			action: 'opportunity.pipeline.completed',
			message: `Opportunity pipeline processed ${aggregate.scanned} raw messages for ${emailAccountId}`,
			metadata: { ...aggregate },
			context: 'OpportunitiesService'
		});

		return aggregate;
	}

	/**
	 * Single-batch processing pass. Scans up to `PROCESS_BATCH_SIZE` pending RawMessage
	 * rows for the account, classifies + (on positives) extracts + (on success) writes
	 * an Opportunity row. Designed to live inside one Inngest `step.run`:
	 *  - Caller owns the retry/loop policy (Inngest functions chain calls until exhausted).
	 *  - `failedRawMessageIds` is returned so the caller can pass them to subsequent
	 *    `processBatch` calls' `excludedRawMessageIds` and avoid re-processing rows that
	 *    just failed within the same pipeline run.
	 *  - `exhausted: true` means the next call would scan zero rows — caller stops the loop.
	 */
	async processBatch(
		emailAccountId: string,
		excludedRawMessageIds: readonly string[],
		options: ProcessBatchOptions = DEFAULT_PROCESS_OPTIONS
	): Promise<OpportunityProcessingBatchResult> {
		const result: OpportunityProcessingResult = {
			emailAccountId,
			scanned: 0,
			classifiedPositive: 0,
			classifiedNegative: 0,
			opportunitiesCreated: 0,
			opportunitiesSkipped: 0,
			failed: 0
		};
		const failedRawMessageIds = new Set<string>();

		const rawMessages = await this.repository.findPendingRawMessagesForAccount(
			emailAccountId,
			PROCESS_BATCH_SIZE,
			excludedRawMessageIds
		);

		if (rawMessages.length === 0) {
			return { result, failedRawMessageIds: [], exhausted: true };
		}

		// Fetch the org's own connected email addresses once per batch
		// so the self-email filter inside per-message + per-thread-group flows is an
		// O(1) Set lookup. All rows in a batch share an emailAccountId (and therefore
		// an organizationId), so a single fetch covers the slice.
		const orgEmailAddresses = await this.repository.findOrganizationEmailAddresses(
			rawMessages[0]?.organizationId ?? ''
		);

		// Group by threadId. Null-threadId messages are treated as
		// individual (no group). Multi-message groups within ONE batch are the canonical
		// shape of a backfill pass over a historical thread; they need to run serially
		// AND newest-first so the thread-as-unit classifier can anchor the opp to the
		// most-recent quote signal. Single-message groups (the typical live delta-sync
		// case) fall through to the existing per-message flow which already handles
		// self-email + thread-reconstitution + classifier.
		const threadGroups = new Map<string, RawMessageForOpportunityProcessing[]>();
		const standaloneMessages: RawMessageForOpportunityProcessing[] = [];
		for (const m of rawMessages) {
			if (!m.threadId) {
				standaloneMessages.push(m);
				continue;
			}
			const group = threadGroups.get(m.threadId);
			if (group) {
				group.push(m);
			} else {
				threadGroups.set(m.threadId, [m]);
			}
		}
		// Split out single-message thread groups — they don't need the thread-as-unit
		// flow (no peers to anchor against). Falling through to `processOneRawMessage`
		// keeps the per-message thread-reconstitution check + classifier path.
		const multiMessageGroups: RawMessageForOpportunityProcessing[][] = [];
		for (const [threadId, group] of threadGroups) {
			if (group.length === 1) {
				standaloneMessages.push(group[0]!);
			} else {
				multiMessageGroups.push(group);
			}
			// Silence "unused" warning for the destructured key — kept for future logging.
			void threadId;
		}

		let aiNotConfigured = false;

		// standalone (no thread / single-message thread group). Chunked parallel.
		// Single-message thread groups fall here because they still need the per-message
		// thread-reconstitution check (the existing opp may have been created in a prior
		// run, e.g. live delta-sync of a brand-new customer reply on a tracked thread).
		for (let i = 0; i < standaloneMessages.length; i += PROCESS_BATCH_CONCURRENCY) {
			if (aiNotConfigured) {
				break;
			}
			const slice = standaloneMessages.slice(i, i + PROCESS_BATCH_CONCURRENCY);
			const outcomes = await Promise.all(
				slice.map(rawMessage =>
					this.processOneRawMessage(rawMessage, orgEmailAddresses, result, failedRawMessageIds, options)
				)
			);
			if (outcomes.some(c => !c)) {
				aiNotConfigured = true;
			}
		}

		// multi-message thread groups. Parallel BETWEEN groups (so a backfill
		// touching many threads doesn't serialize sequentially), serial WITHIN each
		// group (so thread reconstitution + thread-as-unit logic can rely on a stable
		// per-thread DB state).
		for (let i = 0; i < multiMessageGroups.length; i += PROCESS_BATCH_CONCURRENCY) {
			if (aiNotConfigured) {
				break;
			}
			const slice = multiMessageGroups.slice(i, i + PROCESS_BATCH_CONCURRENCY);
			const outcomes = await Promise.all(
				slice.map(group =>
					this.processThreadGroup(group, orgEmailAddresses, result, failedRawMessageIds, options)
				)
			);
			if (outcomes.some(c => !c)) {
				aiNotConfigured = true;
			}
		}

		return {
			result,
			failedRawMessageIds: [...failedRawMessageIds],
			// Stop the outer loop on AI-not-configured (terminal) OR when this batch
			// returned fewer rows than the batch size (no more work to do).
			exhausted: aiNotConfigured || rawMessages.length < PROCESS_BATCH_SIZE
		};
	}

	/**
	 * Thread-as-unit processing for a multi-message thread group within
	 * a single batch. Three branches:
	 *  1. An Opportunity already exists for this thread → process each message via the
	 *     existing per-message flow. Each one hits the thread-reconstitution check and
	 *     attaches. This branch fires `OpportunityFollowupReceived` for each attach in
	 *     live mode (default behavior); backfill mode suppresses those events.
	 *  2. No existing opp AND the mode is `'backfill'` → classify newest-first, anchor
	 *     the opp to the first positive message, attach all others as immutable history,
	 *     mark everything classified. No follow-up events fire (this is a snapshot, not
	 *     a live customer reply). If no positive is found, mark all messages negative
	 *     and skip the thread entirely (chitchat thread, not a lead).
	 *  3. No existing opp AND the mode is `'live'` → fall through to per-message
	 *     processing. The "live" path implies messages arrive one at a time; a batch
	 *     containing multiple messages of a brand-new thread is unusual but handled by
	 *     letting each message classify individually + relying on the per-message
	 *     thread-reconstitution check to attach later ones to the first one. (Same
	 *     race-prone shape as before , but vanishingly rare in live mode.)
	 */
	private async processThreadGroup(
		group: RawMessageForOpportunityProcessing[],
		orgEmailAddresses: Set<string>,
		result: OpportunityProcessingResult,
		failedRawMessageIds: Set<string>,
		options: ProcessBatchOptions
	): Promise<boolean> {
		const first = group[0]!;
		const threadId = first.threadId!;

		// Branch 1 — existing opp on this thread. Fall through to per-message flow.
		const existingOpp = await this.repository.findOpportunityForThread(first.organizationId, threadId);
		if (existingOpp) {
			for (const m of group) {
				const cont = await this.processOneRawMessage(
					m,
					orgEmailAddresses,
					result,
					failedRawMessageIds,
					options
				);
				if (!cont) {
					return false;
				}
			}
			return true;
		}

		// Branch 3 — live mode without an existing opp. Per-message processing keeps
		// the existing semantics (the rare "multiple new-thread messages arrived in one
		// delta-sync" case still produces ONE opp via per-message thread reconstitution
		// once the first message inserts its opp).
		if (options.mode === 'live') {
			for (const m of group) {
				const cont = await this.processOneRawMessage(
					m,
					orgEmailAddresses,
					result,
					failedRawMessageIds,
					options
				);
				if (!cont) {
					return false;
				}
			}
			return true;
		}

		// Branch 2 — backfill, no existing opp. Thread-as-unit classification.
		// Walk oldest-first; the first non-self, non-bulk positive becomes the originating
		// message — that's the customer's *original* request (the one with subject "Badkamer"
		// rather than "Re: Badkamer", and the one whose body usually carries the full ask).
		// Anchoring there means:
		//   - `Opportunity.rawMessage` (rendered as "Originele e-mail") is the actual original
		//   - The extractor input is the richest version of the request, not a follow-up
		//   - "Aanvraag binnengekomen" matches the originating message by construction
		// Self-emails inside the thread are NOT eligible to originate (they're our own
		// outbound) but they ARE attached as history later — they're part of the
		// conversation. Bulk-mails are noise and stay excluded from history.
		// The draft generator uses thread reconstitution to target the latest customer
		// reply regardless of which message is anchored, so changing the anchor doesn't
		// change what the draft replies to.
		const sortedOldestFirst = [...group].sort((a, b) => a.internalDate.getTime() - b.internalDate.getTime());

		let originatingMessage: RawMessageForOpportunityProcessing | null = null;
		let originatingOpportunityId: string | null = null;
		// Bulk-mail rows that should stay out of the attach loop too — they were
		// already marked negative and shouldn't appear in the thread history.
		const bulkSkippedMessages: RawMessageForOpportunityProcessing[] = [];

		for (const candidate of sortedOldestFirst) {
			result.scanned += 1;

			try {
				// Self-email: not eligible as originating. Don't push to bulkSkippedMessages
				// we WANT to attach this message as part of the thread history (it's
				// our own reply that's part of the conversation). Just skip it for the
				// "find anchor" search; the attach loop downstream will pick it up.
				if (candidate.fromEmail && orgEmailAddresses.has(candidate.fromEmail.toLowerCase())) {
					this.logService.logAction({
						action: 'opportunity.pipeline.self_email_in_thread',
						message: `RawMessage ${candidate.id} flagged as own-org sender within thread ${threadId} — not eligible as anchor but kept for history attach`,
						metadata: {
							rawMessageId: candidate.id,
							emailAccountId: candidate.emailAccountId,
							organizationId: candidate.organizationId,
							fromEmail: candidate.fromEmail,
							threadId
						},
						context: 'OpportunitiesService'
					});
					continue;
				}

				// Bulk-mail filter: skip + record so the attach loop also excludes it.
				// Marketing / auto-reply noise doesn't belong in the conversation timeline.
				const bulkMail = detectBulkMail({ provider: candidate.provider, raw: candidate.raw });
				if (bulkMail.isBulk) {
					await this.repository.markRawMessageNegative(candidate.id);
					result.classifiedNegative += 1;
					this.logService.logAction({
						action: 'opportunity.pipeline.bulk_mail_skipped',
						message: `RawMessage ${candidate.id} short-circuited as bulk mail (${bulkMail.reason}) within thread ${threadId}`,
						metadata: {
							rawMessageId: candidate.id,
							emailAccountId: candidate.emailAccountId,
							organizationId: candidate.organizationId,
							reason: bulkMail.reason,
							threadId
						},
						context: 'OpportunitiesService'
					});
					bulkSkippedMessages.push(candidate);
					continue;
				}

				const input = buildRawMessageAIInput({
					provider: candidate.provider,
					subject: candidate.subject,
					fromName: candidate.fromName,
					fromEmail: candidate.fromEmail,
					raw: candidate.raw
				});
				const classification = await this.classifier.classify(input);

				if (!classification.value.isQuote) {
					await this.repository.markRawMessageNegative(candidate.id);
					result.classifiedNegative += 1;
					continue;
				}

				// POSITIVE. Extract and create the opp anchored on THIS message.
				const extraction = await this.extractor.extract(
					input,
					candidate.internalDate.toISOString().slice(0, 10)
				);
				const { created, opportunityId, mailbox } = await this.repository.createOpportunityFromRawMessage({
					rawMessage: candidate,
					classification: classification.value,
					extraction: extraction.value,
					aiProvider: `${extraction.provider}/${extraction.model}`,
					classifiedAiCallId: classification.callId,
					extractedAiCallId: extraction.callId
				});

				result.classifiedPositive += 1;
				if (created) {
					result.opportunitiesCreated += 1;
				} else {
					result.opportunitiesSkipped += 1;
				}

				originatingMessage = candidate;
				originatingOpportunityId = opportunityId;

				// Defensive audit log so we can verify the picker's choice without re-running
				// backfill blind. Captures the message's identity + sender so anomalies
				// (e.g., an outbound message slipping past the self-email filter because of
				// an alias mismatch) become greppable: `action = opportunity.thread.anchor_chosen`.
				this.logService.logAction({
					action: 'opportunity.thread.anchor_chosen',
					message: `Thread ${threadId} anchored on RawMessage ${candidate.id} (from ${candidate.fromEmail ?? '<unknown>'} at ${candidate.internalDate.toISOString()})`,
					metadata: {
						threadId,
						rawMessageId: candidate.id,
						fromEmail: candidate.fromEmail,
						fromName: candidate.fromName,
						internalDate: candidate.internalDate.toISOString(),
						opportunityId,
						organizationId: candidate.organizationId,
						threadSize: group.length
					},
					context: 'OpportunitiesService'
				});

				if (created && opportunityId && mailbox !== null) {
					this.logReceivedViaMailbox(opportunityId, candidate.organizationId, mailbox, {
						rawMessageId: candidate.id,
						internalDate: candidate.internalDate
					});
				}

				if (created && opportunityId) {
					try {
						await inngest.send({
							name: InngestEvents.OpportunityCreated,
							data: { opportunityId, organizationId: candidate.organizationId }
						});
					} catch (error) {
						this.logService.logAction({
							action: 'opportunity.created.enqueue_failed',
							message: `Failed to enqueue reply-draft generation for opportunity ${opportunityId}: ${error instanceof Error ? error.message : 'unknown'}`,
							metadata: {
								opportunityId,
								organizationId: candidate.organizationId,
								rawMessageId: candidate.id,
								threadId
							},
							level: 'error',
							stack: error instanceof Error ? error.stack : undefined,
							context: 'OpportunitiesService'
						});
					}

					// This branch only runs in 'backfill' mode (the 'live' branch above
					// returns earlier). Backfill is a snapshot of historical state — we
					// intentionally do NOT fire user-facing notifications here to avoid
					// flooding the inbox on first connect. The single-message live path
					// in `processOneRawMessage` handles the notify call.
				}

				break; // Found the anchor; stop scanning candidates.
			} catch (error) {
				result.failed += 1;
				failedRawMessageIds.add(candidate.id);
				this.logService.logAction({
					action: 'opportunity.pipeline.raw_message_failed',
					message: `Failed to process RawMessage ${candidate.id} within thread ${threadId}: ${error instanceof Error ? error.message : 'unknown'}`,
					metadata: {
						rawMessageId: candidate.id,
						emailAccountId: candidate.emailAccountId,
						organizationId: candidate.organizationId,
						threadId
					},
					level: 'error',
					stack: error instanceof Error ? error.stack : undefined,
					context: 'OpportunitiesService'
				});

				if (error instanceof AINotConfiguredError) {
					return false;
				}
				// Move on to the next candidate — this thread might still have a positive
				// at an older message.
			}
		}

		if (!originatingMessage || !originatingOpportunityId) {
			// No positive in the thread (or every candidate errored). Mark remaining
			// unclassified messages negative so the next batch doesn't re-scan them; the
			// loop already marked skipped/classified-negative ones individually.
			for (const m of group) {
				if (bulkSkippedMessages.includes(m) || failedRawMessageIds.has(m.id)) {
					continue;
				}
				if (
					originatingMessage &&
					(m as RawMessageForOpportunityProcessing).id ===
						(originatingMessage as RawMessageForOpportunityProcessing).id
				) {
					continue;
				}
				await this.repository.markRawMessageNegative(m.id);
				result.classifiedNegative += 1;
			}
			this.logService.logAction({
				action: 'opportunity.pipeline.thread_no_positive',
				message: `Thread ${threadId} produced no positive classification in ${group.length} messages — no opportunity created`,
				metadata: {
					threadId,
					emailAccountId: first.emailAccountId,
					organizationId: first.organizationId,
					messageCount: group.length
				},
				context: 'OpportunitiesService'
			});
			return true;
		}

		// We have an anchor. Attach all other messages (newer or older) as immutable
		// thread history — including own-org sent replies, so the timeline shows the
		// full conversation. Bulk-mail noise stays excluded. No follow-up event
		// firings — backfill is a snapshot, not a live customer reply chain.
		for (const m of group) {
			if (m.id === originatingMessage.id) {
				continue;
			}
			if (bulkSkippedMessages.includes(m)) {
				continue;
			}
			// Classifier may have already marked some negative within the loop above;
			// re-attach them anyway so the thread history is complete from the UI's
			// perspective. `attachThreadMessage` flips them positive + sets classifiedAt.
			// Self-emails (own-mailbox outbound) attach for thread completeness but
			// must NOT advance `latestCustomerRawMessageId` — the send path uses that
			// pointer's `Message-ID` for `In-Reply-To`, and threading on our own outbound
			// would make recipients see broken parent chains.
			const isSelfEmail = m.fromEmail !== null && orgEmailAddresses.has(m.fromEmail.toLowerCase());
			try {
				await this.repository.attachThreadMessage({
					rawMessageId: m.id,
					opportunityId: originatingOpportunityId,
					customerInternalDate: isSelfEmail ? null : m.internalDate
				});
				result.classifiedPositive += 1;
			} catch (error) {
				result.failed += 1;
				failedRawMessageIds.add(m.id);
				this.logService.logAction({
					action: 'opportunity.pipeline.thread_attach_failed',
					message: `Failed to attach RawMessage ${m.id} to opportunity ${originatingOpportunityId}: ${error instanceof Error ? error.message : 'unknown'}`,
					metadata: {
						rawMessageId: m.id,
						opportunityId: originatingOpportunityId,
						threadId
					},
					level: 'error',
					stack: error instanceof Error ? error.stack : undefined,
					context: 'OpportunitiesService'
				});
			}
		}

		this.logService.logAction({
			action: 'opportunity.pipeline.thread_anchored',
			message: `Thread ${threadId} anchored to opportunity ${originatingOpportunityId} (${group.length} messages, originating ${originatingMessage.id})`,
			metadata: {
				threadId,
				opportunityId: originatingOpportunityId,
				originatingRawMessageId: originatingMessage.id,
				messageCount: group.length,
				emailAccountId: first.emailAccountId,
				organizationId: first.organizationId
			},
			context: 'OpportunitiesService'
		});

		return true;
	}

	private async processOneRawMessage(
		rawMessage: RawMessageForOpportunityProcessing,
		orgEmailAddresses: Set<string>,
		result: OpportunityProcessingResult,
		failedRawMessageIds: Set<string>,
		options: ProcessBatchOptions = DEFAULT_PROCESS_OPTIONS
	): Promise<boolean> {
		result.scanned += 1;

		try {
			// Offertum-notification short-circuit MUST run before thread reconstitution.
			// A notification email matching an existing opp's threadId would otherwise
			// attach as a "customer reply" and fire a follow-up event. Detect by header
			// (X-Offertum-Notification: true) OR sender-domain fallback (RESEND_EMAIL_FROM)
			// in case a relay strips the header.
			const bulkCheck = detectBulkMail({ provider: rawMessage.provider, raw: rawMessage.raw });
			if (bulkCheck.reason === 'offertum_notification' || isOwnNotificationSender(rawMessage, this.config)) {
				await this.repository.markRawMessageNegative(rawMessage.id);
				result.classifiedNegative += 1;
				this.logService.logAction({
					action: 'opportunity.pipeline.bulk_mail_skipped',
					message: `RawMessage ${rawMessage.id} short-circuited as Offertum notification`,
					metadata: {
						rawMessageId: rawMessage.id,
						emailAccountId: rawMessage.emailAccountId,
						organizationId: rawMessage.organizationId,
						reason: 'offertum_notification'
					},
					context: 'OpportunitiesService'
				});
				return true;
			}

			const fromEmailLower = rawMessage.fromEmail?.toLowerCase() ?? null;
			const isOrgOwnSender = fromEmailLower !== null && orgEmailAddresses.has(fromEmailLower);

			// Thread reconstitution runs FIRST. A message whose threadId matches
			// an existing non-dismissed Opportunity is part of an ongoing conversation —
			// attach it regardless of who sent it. Two cases:
			//  - **Customer replied** (`fromEmail` external): standard follow-up flow.
			//    Attach + fire `OpportunityFollowupReceived` so the Inngest function
			//    regenerates a fresh draft against the latest customer message.
			//  - **Own-org sender on a tracked thread** (`fromEmail` in `orgEmailAddresses`):
			//    typically a sibling-inbox echo of something we sent ourselves. Attach
			//    (so the timeline shows the message) but DO NOT fire the follow-up event
			// no point regenerating a draft addressed to ourselves.
			//  correction: a self-message INSIDE a tracked thread is part
			// of the conversation. Only a self-message OUTSIDE any tracked thread is
			// noise — that's what the self-email filter below catches.
			if (rawMessage.threadId) {
				const existingOpp = await this.repository.findOpportunityForThread(
					rawMessage.organizationId,
					rawMessage.threadId
				);
				if (existingOpp) {
					// LIVE mode + own-org sender = the user's own outbound coming back via
					// Gmail/Graph delta-sync (Gmail places a copy in INBOX when you send to
					// yourself, or Sent folder propagates). The ReplyDraft row already
					// represents the sent message in the timeline (status=SENT, badge
					// "Verzonden"), so attaching this RawMessage would duplicate it as a
					// "Klant" reply in `customerReplies`. Skip attach + mark negative.
					// Backfill keeps the existing attach behavior to preserve historical
					// thread timeline.
					if (options.mode === 'live' && isOrgOwnSender) {
						await this.repository.markRawMessageNegative(rawMessage.id);
						result.classifiedNegative += 1;
						this.logService.logAction({
							action: 'opportunity.pipeline.own_outbound_skipped',
							message: `RawMessage ${rawMessage.id} skipped as own-org outbound on tracked thread (opp ${existingOpp.id})`,
							metadata: {
								rawMessageId: rawMessage.id,
								opportunityId: existingOpp.id,
								organizationId: rawMessage.organizationId,
								threadId: rawMessage.threadId,
								fromEmail: rawMessage.fromEmail
							},
							context: 'OpportunitiesService'
						});
						return true;
					}

					// Live customer follow-up: ask the should-reply classifier whether the
					// message expects a written response, or is a conversation closer
					// ("Bedankt, tot dan!", "Akkoord", etc.). On `shouldReply: false`:
					//   - attach as a thread message for timeline visibility
					//   - keep opp status (don't flip REPLIED → NEW)
					//   - skip the follow-up event + draft generation + notification
					// Backfill + own-org paths never need this check (they don't generate
					// drafts in the first place).
					const isLiveCustomerReply = options.mode === 'live' && !isOrgOwnSender;
					let closerSkip = false;
					let shouldReplyCallId: string | null = null;
					let shouldReplyReason: string | null = null;
					if (isLiveCustomerReply) {
						try {
							const { bodyText } = buildRawMessageAIInput({
								provider: rawMessage.provider,
								subject: rawMessage.subject,
								fromName: rawMessage.fromName,
								fromEmail: rawMessage.fromEmail,
								raw: rawMessage.raw
							});
							const shouldReplyResult = await this.shouldReply.classify({
								subject: rawMessage.subject,
								fromName: rawMessage.fromName,
								fromEmail: rawMessage.fromEmail,
								bodyText
							});
							closerSkip = !shouldReplyResult.value.shouldReply;
							shouldReplyCallId = shouldReplyResult.callId;
							shouldReplyReason = shouldReplyResult.value.reason;
						} catch (error) {
							// Classifier failure must not block the follow-up. Default to
							// "draft anyway" — a missed closure detection is recoverable
							// (owner ignores the draft); blocking on AI errors loses real
							// customer replies.
							this.logService.logAction({
								action: 'opportunity.followup.should_reply_failed',
								message: `should-reply classifier errored on ${rawMessage.id} — defaulting to draft`,
								metadata: {
									rawMessageId: rawMessage.id,
									opportunityId: existingOpp.id,
									organizationId: rawMessage.organizationId,
									error: error instanceof Error ? error.message : String(error)
								},
								level: 'warn',
								context: 'OpportunitiesService'
							});
						}
					}

					await this.repository.attachFollowupMessage({
						rawMessageId: rawMessage.id,
						opportunityId: existingOpp.id,
						// Real customer reply (not own-org echo, not closer) → flip to NEW.
						// Closer or own-org → keep current status (REPLIED stays REPLIED).
						resetToNew: !isOrgOwnSender && !closerSkip,
						wasDetectedAsCloser: closerSkip,
						// Own-org outbound never advances the latest-customer pointer (it'd
						// pollute the send path's threading-header source). Customer-side
						// messages — including closers — bump it forward so a future draft
						// references the most recent customer Message-ID.
						customerInternalDate: isOrgOwnSender ? null : rawMessage.internalDate
					});
					result.classifiedPositive += 1;

					if (isLiveCustomerReply && !closerSkip) {
						try {
							await inngest.send({
								name: InngestEvents.OpportunityFollowupReceived,
								data: {
									opportunityId: existingOpp.id,
									organizationId: rawMessage.organizationId,
									triggeredBy: 'customer_reply'
								}
							});
						} catch (error) {
							this.logService.logAction({
								action: 'opportunity.followup.enqueue_failed',
								message: `Failed to enqueue follow-up draft for ${existingOpp.id}: ${error instanceof Error ? error.message : 'unknown'}`,
								metadata: {
									opportunityId: existingOpp.id,
									organizationId: rawMessage.organizationId,
									rawMessageId: rawMessage.id
								},
								level: 'error',
								stack: error instanceof Error ? error.stack : undefined,
								context: 'OpportunitiesService'
							});
						}

						await this.dispatchOpportunityNotification(existingOpp.id, 'customer_reply');
					}

					if (closerSkip) {
						this.logService.logAction({
							action: 'opportunity.followup.closer_detected',
							message: `RawMessage ${rawMessage.id} classified as conversation closer — draft suppressed`,
							metadata: {
								rawMessageId: rawMessage.id,
								opportunityId: existingOpp.id,
								organizationId: rawMessage.organizationId,
								shouldReplyCallId,
								reason: shouldReplyReason
							},
							context: 'OpportunitiesService'
						});
					}

					this.logService.logAction({
						action: 'opportunity.followup.attached',
						message: `RawMessage ${rawMessage.id} attached to existing opportunity ${existingOpp.id} via thread match${isOrgOwnSender ? ' (own-org sender)' : ''}`,
						metadata: {
							rawMessageId: rawMessage.id,
							opportunityId: existingOpp.id,
							organizationId: rawMessage.organizationId,
							threadId: rawMessage.threadId,
							previousStatus: existingOpp.status,
							isOrgOwnSender,
							followupEventFired: options.mode === 'live' && !isOrgOwnSender
						},
						context: 'OpportunitiesService'
					});

					return true;
				}
			}

			// Self-email filter. Only fires for messages that did NOT
			// match an existing tracked thread above. Catches the typical own-org noise:
			// a marketing/operational email from one connected mailbox landing in a
			// sibling inbox with no prior conversation to attach to. Without this the
			// classifier would happily flag the Dutch quote-related copy as a positive
			// and create a phantom opportunity for a sent-mail receipt.
			if (isOrgOwnSender) {
				await this.repository.markRawMessageNegative(rawMessage.id);
				result.classifiedNegative += 1;
				this.logService.logAction({
					action: 'opportunity.pipeline.self_email_skipped',
					message: `RawMessage ${rawMessage.id} short-circuited as own-org outbound (${rawMessage.fromEmail})`,
					metadata: {
						rawMessageId: rawMessage.id,
						emailAccountId: rawMessage.emailAccountId,
						organizationId: rawMessage.organizationId,
						fromEmail: rawMessage.fromEmail
					},
					context: 'OpportunitiesService'
				});
				return true;
			}

			// Pre-filter: short-circuit obvious bulk/marketing mail BEFORE the AI call.
			// Same negative-result effect as a classifier "no" but avoids the OpenAI cost
			// and prevents the well-known vendor-direction misclassification (emails with
			// "offerte aanvragen" / "free quotes" copy from vendors, not from customers).
			// Reuses `bulkCheck` computed above the thread-reconstitution branch.
			if (bulkCheck.isBulk) {
				await this.repository.markRawMessageNegative(rawMessage.id);
				result.classifiedNegative += 1;
				this.logService.logAction({
					action: 'opportunity.pipeline.bulk_mail_skipped',
					message: `RawMessage ${rawMessage.id} short-circuited as bulk mail (${bulkCheck.reason})`,
					metadata: {
						rawMessageId: rawMessage.id,
						emailAccountId: rawMessage.emailAccountId,
						organizationId: rawMessage.organizationId,
						reason: bulkCheck.reason
					},
					context: 'OpportunitiesService'
				});
				return true;
			}

			const input = buildRawMessageAIInput({
				provider: rawMessage.provider,
				subject: rawMessage.subject,
				fromName: rawMessage.fromName,
				fromEmail: rawMessage.fromEmail,
				raw: rawMessage.raw
			});
			const classification = await this.classifier.classify(input);

			if (!classification.value.isQuote) {
				await this.repository.markRawMessageNegative(rawMessage.id);
				result.classifiedNegative += 1;
				return true;
			}

			const extraction = await this.extractor.extract(input, rawMessage.internalDate.toISOString().slice(0, 10));
			const { created, opportunityId, mailbox } = await this.repository.createOpportunityFromRawMessage({
				rawMessage,
				classification: classification.value,
				extraction: extraction.value,
				// Composite `provider/model` identifies the exact SKU that produced the
				// structured fields. The classifier's provenance is still queryable via
				// `classifiedAiCallId` even though we don't materialise it on a column.
				aiProvider: `${extraction.provider}/${extraction.model}`,
				classifiedAiCallId: classification.callId,
				extractedAiCallId: extraction.callId
			});

			if (created && opportunityId && mailbox !== null) {
				this.logReceivedViaMailbox(opportunityId, rawMessage.organizationId, mailbox, {
					rawMessageId: rawMessage.id,
					internalDate: rawMessage.internalDate
				});
			}

			result.classifiedPositive += 1;
			if (created) {
				result.opportunitiesCreated += 1;
				// fan out to the reply-draft generator. Best-effort: a send failure
				// shouldn't abort the per-RawMessage processing (the opportunity is already
				// persisted; the only loss is the auto-draft). A future "find opportunities
				// without a ReplyDraft and re-emit" backfill cron will close the gap if
				// emits start failing systemically. Idempotency is upstream: the
				// `ReplyDraft.opportunityId @unique` constraint blocks duplicates even if
				// we somehow emit twice.
				if (opportunityId) {
					try {
						await inngest.send({
							name: InngestEvents.OpportunityCreated,
							data: { opportunityId, organizationId: rawMessage.organizationId }
						});
					} catch (error) {
						this.logService.logAction({
							action: 'opportunity.created.enqueue_failed',
							message: `Failed to enqueue reply-draft generation for opportunity ${opportunityId}: ${error instanceof Error ? error.message : 'unknown'}`,
							metadata: {
								opportunityId,
								organizationId: rawMessage.organizationId,
								rawMessageId: rawMessage.id
							},
							level: 'error',
							stack: error instanceof Error ? error.stack : undefined,
							context: 'OpportunitiesService'
						});
					}

					if (options.mode === 'live') {
						await this.dispatchOpportunityNotification(opportunityId, 'opportunity_created');
					}
				}
			} else {
				result.opportunitiesSkipped += 1;
			}
			return true;
		} catch (error) {
			result.failed += 1;
			failedRawMessageIds.add(rawMessage.id);

			this.logService.logAction({
				action: 'opportunity.pipeline.raw_message_failed',
				message: `Failed to process RawMessage ${rawMessage.id}: ${error instanceof Error ? error.message : 'unknown'}`,
				metadata: {
					rawMessageId: rawMessage.id,
					emailAccountId: rawMessage.emailAccountId,
					organizationId: rawMessage.organizationId
				},
				level: 'error',
				stack: error instanceof Error ? error.stack : undefined,
				context: 'OpportunitiesService'
			});

			// Poison-message cap: count the failure so a row that fails every run stops
			// being scanned after MAX_CLASSIFY_ATTEMPTS instead of burning an OpenAI call
			// per tick forever. Best-effort — a failed increment only means one extra retry.
			try {
				const attempts = await this.repository.incrementClassifyAttempts(rawMessage.id);
				if (attempts >= MAX_CLASSIFY_ATTEMPTS) {
					this.logService.logAction({
						action: 'opportunity.pipeline.raw_message_poisoned',
						message: `RawMessage ${rawMessage.id} failed ${attempts}x — excluded from further pipeline scans (reset classifyAttempts to retry)`,
						metadata: {
							rawMessageId: rawMessage.id,
							emailAccountId: rawMessage.emailAccountId,
							organizationId: rawMessage.organizationId,
							attempts
						},
						level: 'warn',
						context: 'OpportunitiesService'
					});
				}
			} catch {
				// Swallow — the failure above is the signal that matters.
			}

			return !(error instanceof AINotConfiguredError);
		}
	}

	// Best-effort notification dispatch after an Opportunity event commits. Looks up
	// the mailbox owner (the User who connected the inbox the conversation lives in)
	// and fires through NotificationsService. Swallows errors — never blocks the
	// originating mutation.
	private async dispatchOpportunityNotification(
		opportunityId: string,
		eventType: 'opportunity_created' | 'customer_reply'
	): Promise<void> {
		try {
			const ctx = await this.repository.findOpportunityNotificationContext(opportunityId);
			if (!ctx?.mailboxUserId) {
				return;
			}
			const opportunityUrl = `${this.notifications.webOrigin()}/opportunities/${ctx.opportunityId}`;
			const customer = ctx.customerName ?? 'klant';

			if (eventType === 'opportunity_created') {
				const email = buildOpportunityCreatedEmail({
					customerName: ctx.customerName,
					requestType: ctx.requestType,
					urgency: ctx.urgency.toLowerCase(),
					deadline: ctx.customerDeadline?.toISOString().slice(0, 10) ?? null,
					opportunityUrl
				});
				await this.notifications.notifyUsers({
					userIds: [ctx.mailboxUserId],
					organizationId: ctx.organizationId,
					eventType: PrismaNotificationEventType.OPPORTUNITY_CREATED,
					title: `Nieuwe offerteaanvraag van ${customer}`,
					body: ctx.requestType,
					link: `/opportunities/${ctx.opportunityId}`,
					email
				});
				return;
			}

			const email = buildCustomerReplyEmail({
				customerName: ctx.customerName,
				requestType: ctx.requestType,
				subject: ctx.emailSubject,
				opportunityUrl
			});
			await this.notifications.notifyUsers({
				userIds: [ctx.mailboxUserId],
				organizationId: ctx.organizationId,
				eventType: PrismaNotificationEventType.CUSTOMER_REPLY,
				title: `Reactie van ${customer}`,
				body: ctx.requestType,
				link: `/opportunities/${ctx.opportunityId}`,
				email
			});
		} catch (error) {
			this.logService.logAction({
				action: 'notification.dispatch_failed',
				message: `Failed to dispatch ${eventType} notification for opp ${opportunityId}`,
				metadata: {
					opportunityId,
					eventType,
					error: error instanceof Error ? error.message : String(error)
				},
				level: 'warn',
				context: 'OpportunitiesService'
			});
		}
	}
}

// Defense-in-depth alongside the X-Offertum-Notification header: if a mail relay strips
// custom headers in transit, the from-address still matches the configured RESEND
// sender domain. Conservative — matches the domain part only, so adding a new no-reply
// address under the same domain is automatically covered.
function isOwnNotificationSender(
	rawMessage: { fromEmail: string | null },
	config: ConfigService<EnvSchema, true>
): boolean {
	const fromEmail = rawMessage.fromEmail?.toLowerCase() ?? null;
	if (!fromEmail) {
		return false;
	}
	const senderAddress = config.get('RESEND_EMAIL_FROM', { infer: true });
	if (!senderAddress) {
		return false;
	}
	const senderDomain = senderAddress.toLowerCase().split('@')[1];
	if (!senderDomain) {
		return false;
	}
	return fromEmail.endsWith(`@${senderDomain}`);
}

function clampLimit(raw: number | null): number {
	if (raw === null || Number.isNaN(raw)) {
		return LIST_DEFAULT_PAGE_SIZE;
	}
	const rounded = Math.trunc(raw);
	if (rounded <= 0) {
		return LIST_DEFAULT_PAGE_SIZE;
	}
	return Math.min(rounded, LIST_MAX_PAGE_SIZE);
}

function mergeProcessingResults(target: OpportunityProcessingResult, source: OpportunityProcessingResult): void {
	target.scanned += source.scanned;
	target.classifiedPositive += source.classifiedPositive;
	target.classifiedNegative += source.classifiedNegative;
	target.opportunitiesCreated += source.opportunitiesCreated;
	target.opportunitiesSkipped += source.opportunitiesSkipped;
	target.failed += source.failed;
}

function toOpportunityResponseDto(opportunity: OpportunityRecord): OpportunityResponseDto {
	return {
		id: opportunity.id,
		organizationId: opportunity.organizationId,
		emailAccountId: opportunity.emailAccountId,
		rawMessageId: opportunity.rawMessageId,
		status: OPPORTUNITY_STATUS_TO_WIRE[opportunity.status],
		aiProvider: opportunity.aiProvider,
		requestType: opportunity.requestType,
		urgency: OPPORTUNITY_URGENCY_TO_WIRE[opportunity.urgency],
		deliverableHints: toStringArray(opportunity.deliverableHints),
		createdAt: opportunity.createdAt.toISOString(),
		updatedAt: opportunity.updatedAt.toISOString(),
		internalDate: opportunity.rawMessage.internalDate.toISOString(),
		subject: opportunity.rawMessage.subject,
		fromEmail: opportunity.rawMessage.fromEmail,
		fromName: opportunity.rawMessage.fromName,
		threadId: opportunity.rawMessage.threadId,
		classifierConfidence: opportunity.classifierConfidence,
		classifierReason: opportunity.classifierReason,
		customerName: opportunity.customerName,
		customerEmail: opportunity.customerEmail,
		address: opportunity.address,
		customerDeadline: opportunity.customerDeadline?.toISOString() ?? null,
		customerAppointment: opportunity.customerAppointment?.toISOString() ?? null,
		dismissedAt: opportunity.dismissedAt?.toISOString() ?? null,
		dismissReason: opportunity.dismissReason ? OPPORTUNITY_DISMISS_REASON_TO_WIRE[opportunity.dismissReason] : null,
		dismissedByUserId: opportunity.dismissedById ?? null,
		assignedToUserId: opportunity.assignedToUserId ?? null,
		// `replyDrafts` is 1:N, ordered `createdAt DESC` by the include. Picking
		// the *first* draft with a `sentAt` gives us the most-recent send, which is what
		// the dismiss-dialog warning + the `dismissedAfterSend` audit flag care about.
		replyDraftSentAt: opportunity.replyDrafts.find(d => d.sentAt !== null)?.sentAt?.toISOString() ?? null,
		// suppress the indicator on dismissed rows. A check-in is only ever
		// "actionable" if the owner is still working the opp; on a dismissed row the
		// pill would be noise (and a stale CHECK_IN could exist from a race where the
		// opp was dismissed between scheduler enumeration and processor run).
		hasPendingCheckIn: opportunity.dismissedAt === null && hasPendingCheckIn(opportunity.replyDrafts),
		// Both resolved by `list()` (it has the org email set needed to tell customer-side
		// messages from own-org outbound). Single-row endpoints don't drive the list badge —
		// the web invalidates + refetches the list after every mutation — so they default here.
		lastActivity: null,
		customerReplyCount: 0
	};
}

interface PendingCheckInProbe {
	kind: PrismaReplyDraftKind;
	status: PrismaReplyDraftStatus;
}

// Latest draft is the head of the `createdAt DESC` array. A pending check-in
// surfaces when that head is a scheduler-generated CHECK_IN and hasn't been sent yet —
// once sent, the regular status chip + sent timestamp carry the signal so the dedicated
// indicator stands down.
function hasPendingCheckIn(replyDrafts: ReadonlyArray<PendingCheckInProbe>): boolean {
	const latest = replyDrafts[0];
	if (!latest) {
		return false;
	}
	return latest.kind === PrismaReplyDraftKind.CHECK_IN && latest.status !== PrismaReplyDraftStatus.SENT;
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((item): item is string => typeof item === 'string');
}

function toReplyDraftResponseDto(draft: OpportunityDetailRecord['replyDrafts'][number]): ReplyDraftResponseDto {
	return {
		id: draft.id,
		opportunityId: draft.opportunityId,
		originalBody: draft.originalBody,
		body: draft.body,
		status: REPLY_DRAFT_STATUS_TO_WIRE[draft.status],
		// `kind` is a Prisma enum mirrored 1:1 to the lowercased wire format.
		// Direct `.toLowerCase` is safe because the wire union is `'reply' | 'check_in'`,
		// matching `REPLY` / `CHECK_IN` lowercased.
		kind: draft.kind.toLowerCase() as 'reply' | 'check_in',
		wasEditedByUser: draft.wasEditedByUser,
		aiCallId: draft.aiCallId ?? null,
		sentAt: draft.sentAt?.toISOString() ?? null,
		createdAt: draft.createdAt.toISOString(),
		updatedAt: draft.updatedAt.toISOString(),
		// sourced from the linked AICall's `createdAt`. Advances on regenerate.
		// Falls back to `null` when `aiCallId` is unset OR the join didn't pull the row
		// (best-effort persist failure); the FE then uses `createdAt` as a fallback.
		aiBodyGeneratedAt: draft.aiCall?.createdAt.toISOString() ?? null,
		//  follow-up — staged attachments. Always an array (never `null`) so the UI
		// doesn't branch on presence.
		attachments: draft.attachments.map(a => ({
			id: a.id,
			replyDraftId: a.replyDraftId,
			filename: a.filename,
			contentType: a.contentType,
			sizeBytes: a.sizeBytes,
			quotePdfId: a.quotePdfId,
			createdAt: a.createdAt.toISOString()
		}))
	};
}

/**
 * Earliest customer-side message in the thread = when the conversation actually
 * started, from the owner's mental-model perspective. The picker anchors on the
 * NEWEST positive (draft-target semantics) so `opportunity.rawMessage` may not
 * be the chronologically-first inbound — earlier customer follow-ups (or earlier
 * messages in a batch processed via `processOneRawMessage` instead of
 * `processThreadGroup`) attached via `attachFollowupMessage` can predate it.
 *
 * Walks the originating RawMessage + every inbound thread message; ignores own-
 * mailbox outbound (those have `fromEmail` ∈ `orgEmailAddresses`). Falls back to
 * the originating message's date when no message has a `fromEmail` we can compare.
 */
function computeEarliestCustomerArrival(
	opportunity: OpportunityDetailRecord,
	orgEmailAddresses: ReadonlySet<string>
): Date {
	const isInbound = (fromEmail: string | null): boolean =>
		fromEmail === null || !orgEmailAddresses.has(fromEmail.toLowerCase());

	const candidates: Date[] = [];
	if (isInbound(opportunity.rawMessage.fromEmail)) {
		candidates.push(opportunity.rawMessage.internalDate);
	}
	for (const m of opportunity.threadMessages) {
		if (isInbound(m.fromEmail)) {
			candidates.push(m.internalDate);
		}
	}

	// `opportunity.rawMessage` is always present and the picker excludes self-emails,
	// so `candidates` is at least 1 in practice. Defensive fallback for the impossible
	// path so we never crash on an edge-case detail load.
	if (candidates.length === 0) {
		return opportunity.rawMessage.internalDate;
	}
	return candidates.reduce((earliest, current) => (current < earliest ? current : earliest));
}

function toOpportunityDetailResponseDto(
	opportunity: OpportunityDetailRecord,
	originalEmailBody: string,
	timeline: OpportunityTimelineEvent[],
	orgEmailAddresses: ReadonlySet<string>
): OpportunityDetailResponseDto {
	return {
		// Re-uses the same field projection as the list response — keeps the shapes in
		// lockstep so adding an Opportunity column shows up in both places automatically.
		id: opportunity.id,
		organizationId: opportunity.organizationId,
		emailAccountId: opportunity.emailAccountId,
		rawMessageId: opportunity.rawMessageId,
		status: OPPORTUNITY_STATUS_TO_WIRE[opportunity.status],
		aiProvider: opportunity.aiProvider,
		requestType: opportunity.requestType,
		urgency: OPPORTUNITY_URGENCY_TO_WIRE[opportunity.urgency],
		deliverableHints: toStringArray(opportunity.deliverableHints),
		createdAt: opportunity.createdAt.toISOString(),
		updatedAt: opportunity.updatedAt.toISOString(),
		internalDate: opportunity.rawMessage.internalDate.toISOString(),
		subject: opportunity.rawMessage.subject,
		fromEmail: opportunity.rawMessage.fromEmail,
		fromName: opportunity.rawMessage.fromName,
		threadId: opportunity.rawMessage.threadId,
		classifierConfidence: opportunity.classifierConfidence,
		classifierReason: opportunity.classifierReason,
		customerName: opportunity.customerName,
		customerEmail: opportunity.customerEmail,
		address: opportunity.address,
		customerDeadline: opportunity.customerDeadline?.toISOString() ?? null,
		customerAppointment: opportunity.customerAppointment?.toISOString() ?? null,
		dismissedAt: opportunity.dismissedAt?.toISOString() ?? null,
		dismissReason: opportunity.dismissReason ? OPPORTUNITY_DISMISS_REASON_TO_WIRE[opportunity.dismissReason] : null,
		dismissedByUserId: opportunity.dismissedById ?? null,
		assignedToUserId: opportunity.assignedToUserId ?? null,
		// `replyDrafts` is 1:N. See the list mapper for the same `find` logic.
		replyDraftSentAt: opportunity.replyDrafts.find(d => d.sentAt !== null)?.sentAt?.toISOString() ?? null,
		hasPendingCheckIn: opportunity.dismissedAt === null && hasPendingCheckIn(opportunity.replyDrafts),
		// Detail view has its own timeline panel that surfaces the per-event actor —
		// no need to duplicate the badge here.
		lastActivity: null,
		customerReplyCount: opportunity.threadMessages.filter(
			m => m.fromEmail === null || !orgEmailAddresses.has(m.fromEmail.toLowerCase())
		).length,
		originalEmailBody,
		// Latest draft (`createdAt DESC` already applied in the include) — null when no
		// draft exists yet (cold-start window between Opportunity insert and the
		// `reply-draft-generate` Inngest function finishing).
		replyDraft: opportunity.replyDrafts[0] ? toReplyDraftResponseDto(opportunity.replyDrafts[0]) : null,
		// Read-only history panel below the editor. Includes ALL drafts NEWEST-
		// FIRST except the currently-editable one. The latest draft is excluded only
		// when it's still in-progress (PENDING_APPROVAL / EDITED); once it transitions
		// to SENT it stays in `replyDraft` (so the editor keeps showing the read-only
		// "Verzonden om…" view) AND ALSO appears here (the user's mental model: a sent
		// draft is "history" the moment it's sent, not when a follow-up supersedes it).
		replyDraftHistory: (opportunity.replyDrafts[0]?.status === 'SENT'
			? opportunity.replyDrafts
			: opportunity.replyDrafts.slice(1)
		).map(toReplyDraftResponseDto),
		//  follow-up — inbound customer replies attached via thread reconstitution.
		// Newest-first (matches the FE's expected merge order). Body extracted from the
		// raw provider payload via `buildRawMessageAIInput` (same plain-text rendering
		// used for the original-email panel + the AI classifier input — keeps the wire
		// shape consistent across all "show me this message body" surfaces).
		customerReplies: opportunity.threadMessages.map(m => ({
			id: m.id,
			fromName: m.fromName,
			fromEmail: m.fromEmail,
			receivedAt: m.internalDate.toISOString(),
			body: buildRawMessageAIInput({
				provider: m.emailAccount.provider,
				subject: m.subject,
				fromName: m.fromName,
				fromEmail: m.fromEmail,
				raw: m.raw
			}).bodyText,
			// Same `From`-address comparison the self-email-filter uses upstream. A
			// thread message whose sender matches one of the org's connected mailboxes
			// is OUR own outbound reply pulled in by the provider's "sent items" backfill
			// — render it as such instead of mis-labeling it "Klant".
			direction:
				m.fromEmail !== null && orgEmailAddresses.has(m.fromEmail.toLowerCase()) ? 'outbound' : 'inbound',
			wasDetectedAsCloser: m.wasDetectedAsCloser
		})),
		timeline
	};
}

const WIRE_OPPORTUNITY_STATUSES = new Set<WireOpportunityStatus>(['new', 'waiting', 'replied', 'cold', 'won', 'lost']);
const WIRE_DISMISS_REASONS = new Set<WireDismissReason>(['not_a_quote', 'duplicate', 'spam', 'other']);
const WIRE_URGENCIES = new Set<WireOpportunityUrgency>(['emergency', 'high', 'normal', 'low']);
const TIMELINE_FIELD_KEYS = new Set(['urgency', 'address', 'customerDeadline', 'customerAppointment']);

function readString(metadata: Record<string, unknown>, key: string): string | null {
	const value = metadata[key];
	return typeof value === 'string' ? value : null;
}

function readNumber(metadata: Record<string, unknown>, key: string): number | null {
	const value = metadata[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStatus(metadata: Record<string, unknown>, key: string): WireOpportunityStatus | null {
	const value = readString(metadata, key);
	return value !== null && WIRE_OPPORTUNITY_STATUSES.has(value as WireOpportunityStatus)
		? (value as WireOpportunityStatus)
		: null;
}

function readReason(metadata: Record<string, unknown>, key: string): WireDismissReason | null {
	const value = readString(metadata, key);
	return value !== null && WIRE_DISMISS_REASONS.has(value as WireDismissReason) ? (value as WireDismissReason) : null;
}

function readNullableString(value: unknown): string | null {
	if (value === null) {
		return null;
	}
	return typeof value === 'string' ? value : null;
}

function readNullableUrgency(value: unknown): WireOpportunityUrgency | null {
	if (value === null) {
		return null;
	}
	return typeof value === 'string' && WIRE_URGENCIES.has(value as WireOpportunityUrgency)
		? (value as WireOpportunityUrgency)
		: null;
}

/**
 * Decode one `(field, before, after)` slice of an `opportunity.fields_updated`
 * log into a typed `OpportunityFieldChange`. Returns `null` for unknown fields
 * so the caller drops them silently.
 */
function decodeFieldChange(field: string, before: unknown, after: unknown): OpportunityFieldChange | null {
	if (!TIMELINE_FIELD_KEYS.has(field)) {
		return null;
	}
	if (field === 'urgency') {
		return { field: 'urgency', before: readNullableUrgency(before), after: readNullableUrgency(after) };
	}
	return {
		field: field as 'address' | 'customerDeadline' | 'customerAppointment',
		before: readNullableString(before),
		after: readNullableString(after)
	};
}

/**
 * Maps an audit-log row to a typed timeline event. Returns `null` when the row's
 * metadata is malformed (missing required keys or invalid enum values) so the
 * caller can drop it rather than render garbage.
 */
function toOpportunityTimelineEvent(
	row: { id: string; createdAt: Date; metadata: Record<string, unknown> },
	actorLabels: ReadonlyMap<string, string>
): OpportunityTimelineEvent | null {
	const action = readString(row.metadata, 'action');
	const occurredAt = row.createdAt.toISOString();
	const actorUserId = readString(row.metadata, 'actorUserId');
	const actorName = actorUserId !== null ? (actorLabels.get(actorUserId) ?? null) : null;

	switch (action) {
		case 'opportunity.status.updated': {
			const nextStatus = readStatus(row.metadata, 'nextStatus');
			if (nextStatus === null) {
				return null;
			}
			return {
				id: row.id,
				kind: 'status_changed',
				occurredAt,
				actorUserId,
				actorName,
				previousStatus: readStatus(row.metadata, 'previousStatus'),
				nextStatus
			};
		}
		case 'opportunity.auto_cold.flipped': {
			const daysSinceSent = readNumber(row.metadata, 'daysSinceSent');
			const coldAfterDays = readNumber(row.metadata, 'coldAfterDays');
			if (daysSinceSent === null || coldAfterDays === null) {
				return null;
			}
			return {
				id: row.id,
				kind: 'auto_cold',
				occurredAt,
				actorUserId: null,
				actorName: null,
				daysSinceSent,
				coldAfterDays
			};
		}
		case 'opportunity.dismissed': {
			const reason = readReason(row.metadata, 'reason');
			if (reason === null) {
				return null;
			}
			return {
				id: row.id,
				kind: 'dismissed',
				occurredAt,
				actorUserId,
				actorName,
				reason,
				previousReason: readReason(row.metadata, 'previousReason'),
				previousStatus: readStatus(row.metadata, 'previousStatus'),
				notes: readString(row.metadata, 'notes')
			};
		}
		case 'opportunity.undismissed': {
			return {
				id: row.id,
				kind: 'undismissed',
				occurredAt,
				actorUserId,
				actorName,
				previousReason: readReason(row.metadata, 'previousReason')
			};
		}
		case 'opportunity.fields_updated': {
			const changedKeys = row.metadata.changedKeys;
			const diff = row.metadata.diff;
			if (!Array.isArray(changedKeys) || typeof diff !== 'object' || diff === null) {
				return null;
			}
			const changes: OpportunityFieldChange[] = [];
			for (const rawKey of changedKeys) {
				if (typeof rawKey !== 'string') {
					continue;
				}
				const slice = (diff as Record<string, unknown>)[rawKey];
				if (typeof slice !== 'object' || slice === null) {
					continue;
				}
				const { before, after } = slice as { before: unknown; after: unknown };
				const change = decodeFieldChange(rawKey, before, after);
				if (change !== null) {
					changes.push(change);
				}
			}
			if (changes.length === 0) {
				// All changed keys were unknown to the renderer (e.g. only a not-yet-
				// supported field changed). Drop the event rather than show an empty row.
				return null;
			}
			return { id: row.id, kind: 'fields_updated', occurredAt, actorUserId, actorName, changes };
		}
		case 'opportunity.assigned': {
			const previousAssigneeUserId = readString(row.metadata, 'previousAssigneeUserId');
			const nextAssigneeUserId = readString(row.metadata, 'nextAssigneeUserId');
			return {
				id: row.id,
				kind: 'assigned',
				occurredAt,
				actorUserId,
				actorName,
				previousAssigneeUserId,
				previousAssigneeName:
					previousAssigneeUserId !== null ? (actorLabels.get(previousAssigneeUserId) ?? null) : null,
				nextAssigneeUserId,
				nextAssigneeName: nextAssigneeUserId !== null ? (actorLabels.get(nextAssigneeUserId) ?? null) : null
			};
		}
		case 'opportunity.received_via_mailbox': {
			const mailboxEmail = readString(row.metadata, 'mailboxEmail');
			if (mailboxEmail === null) {
				return null;
			}
			// Prefer the originating RawMessage's internalDate over Log.createdAt — the
			// latter is import time (today for any backfilled opp), the former is when
			// the customer actually emailed. Older Log rows written before this metadata
			// field was added fall back to Log.createdAt.
			const originatingInternalDate = readString(row.metadata, 'originatingInternalDate');
			return {
				id: row.id,
				kind: 'received_via_mailbox',
				occurredAt: originatingInternalDate ?? occurredAt,
				actorUserId: null,
				actorName: null,
				mailboxEmail,
				mailboxOwnerUserId: readString(row.metadata, 'mailboxOwnerUserId'),
				mailboxOwnerName: readString(row.metadata, 'mailboxOwnerName')
			};
		}
		case 'opportunity.quote_created': {
			const quoteDraftId = readString(row.metadata, 'quoteDraftId');
			if (quoteDraftId === null) {
				return null;
			}
			return {
				id: row.id,
				kind: 'quote_created',
				occurredAt,
				actorUserId,
				actorName,
				quoteDraftId,
				lineCount: readNumber(row.metadata, 'lineCount') ?? 0
			};
		}
		case 'opportunity.quote_pdf_generated': {
			const quotePdfId = readString(row.metadata, 'quotePdfId');
			if (quotePdfId === null) {
				return null;
			}
			return {
				id: row.id,
				kind: 'quote_pdf_generated',
				occurredAt,
				actorUserId,
				actorName,
				quotePdfId,
				filename: readString(row.metadata, 'filename') ?? 'offerte.pdf'
			};
		}
		default:
			return null;
	}
}
