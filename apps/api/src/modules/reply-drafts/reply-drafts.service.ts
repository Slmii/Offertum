import { EmailProvider } from '@/generated/prisma/enums';
import { buildRawMessageAIInput } from '@/lib/email/raw-message-ai-input';
import { extractReplyHeaders } from '@/lib/email/raw-message-reply-headers';
import { buildRfc2822Reply, composeReplySubject, type BuildRfc2822ReplyAttachment } from '@/lib/email/rfc2822-reply';
import { ATTACHMENT_MAX_TOTAL_BYTES } from '@/lib/storage/attachment-constraints';
import { ATTACHMENT_STORAGE, type AttachmentStorage } from '@/lib/storage/attachment-storage.interface';
import { ReplyDraftGenerator } from '@/modules/ai/reply-draft/reply-draft-generator.service';
import type { ReplyDraftInput } from '@/modules/ai/reply-draft/reply-draft.types';
import { EmailAccountsService } from '@/modules/email-accounts/email-accounts.service';
import { GmailApiService } from '@/modules/gmail/gmail-api.service';
import { LogService } from '@/modules/logger/log.service';
import { MicrosoftGraphApiService } from '@/modules/microsoft/microsoft-graph-api.service';
import type { SendContextAttachment } from '@/modules/reply-drafts/reply-drafts.repository';
import { ReplyDraftsRepository } from '@/modules/reply-drafts/reply-drafts.repository';
import { Inject, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { attachmentTotalTooLarge } from '@/lib/errors';

/**
 * W5.3 — orchestrates draft generation for a freshly-created Opportunity. Called by the
 * `reply-draft-generate` Inngest function.
 *
 * Generate-on-arrival with org-default voice:
 *  1. Fetch the opportunity + its `RawMessage` (for the original body).
 *  2. Find the org's OWNER → use their `tonePlaybookText` as the default voice. The W5.4
 *     detail view will later offer "regenerate in my voice" for non-OWNER members.
 *  3. Call the AI generator. NULL playbook → generic Dutch baseline (D31).
 *  4. Persist as a `ReplyDraft` row. The `opportunityId @unique` constraint + the
 *     `createMany({ skipDuplicates: true })` in the repository make this idempotent —
 *     Inngest can retry the function safely without producing duplicate drafts.
 *
 * Failures are best-effort logged + thrown back to Inngest, which retries per its
 * function-level retry policy.
 */
/**
 * W5.3 — Result of `upsertFromOpportunity`. `alreadyExisted: true` is a signal — not
 * a failure — that the Inngest function is retrying or that another caller raced us
 * to the row; the caller doesn't need to do anything.
 */
export interface UpsertReplyDraftResult {
	created: boolean;
	alreadyExisted: boolean;
}

/**
 * W5.4 — Result of `regenerate`. `opportunityFound: false` lets the controller emit a
 * 404 cleanly without overloading the `overwrote` flag.
 */
export interface RegenerateReplyDraftResult {
	overwrote: boolean;
	opportunityFound: boolean;
}

/**
 * W5.5 — Discriminated union for `send`. Three terminal states the controller maps to
 * distinct HTTP responses:
 *  - `{ sent: true }` → 200 with the SENT draft.
 *  - `{ sent: false, alreadySent: true }` → 409 ("already sent").
 *  - `{ sent: false, alreadySent: false, reason }` → 404 or 422 depending on reason.
 *
 * Using a union (not a single shape with `success: boolean`) means the type system
 * forces the caller to handle every variant — no silent "we returned an error tuple
 * but the caller treated it as success" bug.
 */
export type SendReplyDraftResult =
	| { sent: true; sentAt: Date }
	| { sent: false; alreadySent: true }
	| { sent: false; alreadySent: false; reason: 'not_found' | 'no_inbox_owner' };

@Injectable()
export class ReplyDraftsService {
	constructor(
		private readonly repository: ReplyDraftsRepository,
		private readonly generator: ReplyDraftGenerator,
		private readonly logService: LogService,
		private readonly emailAccounts: EmailAccountsService,
		private readonly gmail: GmailApiService,
		private readonly graph: MicrosoftGraphApiService,
		@Inject(ATTACHMENT_STORAGE) private readonly attachmentStorage: AttachmentStorage
	) {}

	/**
	 * W5.6 — Convenience passthrough used by the "compose follow-up" controller path.
	 * Kept on the service (vs. dipping into the repo from `OpportunitiesService`) so
	 * the public surface this module exposes stays cohesive.
	 */
	isLatestDraftSent(opportunityId: string): Promise<boolean> {
		return this.repository.isLatestDraftSent(opportunityId);
	}

	async upsertFromOpportunity(opportunityId: string): Promise<UpsertReplyDraftResult> {
		// Short-circuit: if the row already exists, the Inngest function is retrying or
		// the user has multiple opportunities reaching this code path. Cheaper than re-
		// running the AI call only to fail on the unique constraint.
		const existing = await this.repository.findByOpportunityId(opportunityId);
		if (existing) {
			return { created: false, alreadyExisted: true };
		}

		const opportunity = await this.repository.findOpportunityForGeneration(opportunityId);
		if (!opportunity) {
			this.logService.logAction({
				action: 'reply_draft.opportunity_not_found',
				message: `Opportunity ${opportunityId} not found at draft-generation time`,
				metadata: { opportunityId },
				level: 'warn',
				context: 'ReplyDraftsService'
			});
			return { created: false, alreadyExisted: false };
		}

		const owner = await this.repository.findOwnerForOrganization(opportunity.organizationId);
		const organizationName = (await this.repository.findOrganizationName(opportunity.organizationId)) ?? 'Quoteom';

		const bodyText = buildRawMessageAIInput({
			provider: opportunity.rawMessage.provider,
			subject: opportunity.rawMessage.subject,
			fromName: opportunity.rawMessage.fromName,
			fromEmail: opportunity.rawMessage.fromEmail,
			raw: opportunity.rawMessage.raw
		}).bodyText;

		const input: ReplyDraftInput = {
			subject: opportunity.rawMessage.subject,
			fromName: opportunity.rawMessage.fromName,
			fromEmail: opportunity.rawMessage.fromEmail,
			bodyText,
			customerName: opportunity.customerName,
			address: opportunity.address,
			requestType: opportunity.requestType,
			urgency: this.toWireUrgency(opportunity.urgency),
			customerDeadline: opportunity.customerDeadline?.toISOString().slice(0, 10) ?? null,
			customerAppointment: opportunity.customerAppointment?.toISOString().slice(0, 10) ?? null,
			deliverableHints: this.toStringArray(opportunity.deliverableHints),
			tonePlaybookText: owner?.tonePlaybookText ?? null,
			senderName: owner?.name ?? null,
			organizationName
		};

		const result = await this.generator.generate(input);

		const created = await this.repository.createIfAbsent({
			opportunityId,
			body: result.value.body,
			aiCallId: result.callId
		});

		this.logService.logAction({
			action: created ? 'reply_draft.created' : 'reply_draft.race_lost',
			message: created
				? `Reply draft generated for opportunity ${opportunityId}`
				: `Reply draft already existed when we tried to write for opportunity ${opportunityId}`,
			metadata: {
				opportunityId,
				organizationId: opportunity.organizationId,
				aiProvider: `${result.provider}/${result.model}`,
				usedTonePlaybook: input.tonePlaybookText !== null,
				ownerUserId: owner?.userId ?? null,
				bodyLength: result.value.body.length
			},
			context: 'ReplyDraftsService'
		});

		return { created, alreadyExisted: false };
	}

	/**
	 * W5.6 — Generate a follow-up draft for an existing opportunity. Always creates a
	 * NEW `ReplyDraft` row (does not overwrite the prior SENT one — that row stays as
	 * an immutable record of what the customer received). Two callers:
	 *  1. The Inngest `OpportunityFollowupReceived` handler when a customer reply lands
	 *     on the thread (`triggeredBy: 'customer_reply'`).
	 *  2. The "Concept-vervolg opstellen" endpoint when the owner manually requests a
	 *     follow-up draft on a SENT opp (`triggeredBy: 'owner_compose'`).
	 *
	 * Uses the requesting user's voice when supplied (matches the W5.4 regenerate
	 * semantics); falls back to the org OWNER's voice otherwise (matches the W5.3
	 * generate-on-arrival semantics) so a customer-reply on an opp where the OWNER is
	 * the inbox connector still produces a draft in their voice.
	 *
	 * Returns the newly-inserted draft's id so the caller can echo or audit-log it.
	 */
	async generateFollowupDraft(
		opportunityId: string,
		requestingUserId: string | null,
		triggeredBy: 'customer_reply' | 'owner_compose'
	): Promise<{ created: boolean; draftId: string | null }> {
		const opportunity = await this.repository.findOpportunityForGeneration(opportunityId);
		if (!opportunity) {
			this.logService.logAction({
				action: 'reply_draft.followup.opportunity_not_found',
				message: `Opportunity ${opportunityId} not found at follow-up draft-generation time`,
				metadata: { opportunityId, triggeredBy },
				level: 'warn',
				context: 'ReplyDraftsService'
			});
			return { created: false, draftId: null };
		}

		const voice = requestingUserId
			? await this.repository.findUserForVoice(requestingUserId)
			: await this.repository.findOwnerForOrganization(opportunity.organizationId);
		const organizationName = (await this.repository.findOrganizationName(opportunity.organizationId)) ?? 'Quoteom';

		const bodyText = buildRawMessageAIInput({
			provider: opportunity.rawMessage.provider,
			subject: opportunity.rawMessage.subject,
			fromName: opportunity.rawMessage.fromName,
			fromEmail: opportunity.rawMessage.fromEmail,
			raw: opportunity.rawMessage.raw
		}).bodyText;

		const input: ReplyDraftInput = {
			subject: opportunity.rawMessage.subject,
			fromName: opportunity.rawMessage.fromName,
			fromEmail: opportunity.rawMessage.fromEmail,
			bodyText,
			customerName: opportunity.customerName,
			address: opportunity.address,
			requestType: opportunity.requestType,
			urgency: this.toWireUrgency(opportunity.urgency),
			customerDeadline: opportunity.customerDeadline?.toISOString().slice(0, 10) ?? null,
			customerAppointment: opportunity.customerAppointment?.toISOString().slice(0, 10) ?? null,
			deliverableHints: this.toStringArray(opportunity.deliverableHints),
			tonePlaybookText: voice?.tonePlaybookText ?? null,
			senderName: voice?.name ?? null,
			organizationName
		};

		const result = await this.generator.generate(input);

		const { draftId } = await this.repository.createFollowup({
			opportunityId,
			body: result.value.body,
			aiCallId: result.callId
		});

		this.logService.logAction({
			action: 'reply_draft.followup.created',
			message: `Follow-up reply draft generated for opportunity ${opportunityId} (${triggeredBy})`,
			metadata: {
				opportunityId,
				organizationId: opportunity.organizationId,
				aiProvider: `${result.provider}/${result.model}`,
				usedTonePlaybook: input.tonePlaybookText !== null,
				voiceUserId: voice?.userId ?? null,
				bodyLength: result.value.body.length,
				draftId,
				triggeredBy
			},
			context: 'ReplyDraftsService'
		});

		return { created: true, draftId };
	}

	/**
	 * W5.4 — Regenerate the draft for an opportunity using the *requesting user's*
	 * `tonePlaybookText` (not the org OWNER's, unlike `upsertFromOpportunity`). Powers
	 * the "Regenereer in mijn stijl" button. Refuses to overwrite a SENT draft (the
	 * email is already out the door). Returns `{ overwrote: false }` in that case so
	 * the controller can surface 409 to the FE.
	 */
	async regenerate(opportunityId: string, requestingUserId: string): Promise<RegenerateReplyDraftResult> {
		const opportunity = await this.repository.findOpportunityForGeneration(opportunityId);
		if (!opportunity) {
			return { overwrote: false, opportunityFound: false };
		}

		const voice = await this.repository.findUserForVoice(requestingUserId);
		const organizationName = (await this.repository.findOrganizationName(opportunity.organizationId)) ?? 'Quoteom';

		const bodyText = buildRawMessageAIInput({
			provider: opportunity.rawMessage.provider,
			subject: opportunity.rawMessage.subject,
			fromName: opportunity.rawMessage.fromName,
			fromEmail: opportunity.rawMessage.fromEmail,
			raw: opportunity.rawMessage.raw
		}).bodyText;

		const input: ReplyDraftInput = {
			subject: opportunity.rawMessage.subject,
			fromName: opportunity.rawMessage.fromName,
			fromEmail: opportunity.rawMessage.fromEmail,
			bodyText,
			customerName: opportunity.customerName,
			address: opportunity.address,
			requestType: opportunity.requestType,
			urgency: this.toWireUrgency(opportunity.urgency),
			customerDeadline: opportunity.customerDeadline?.toISOString().slice(0, 10) ?? null,
			customerAppointment: opportunity.customerAppointment?.toISOString().slice(0, 10) ?? null,
			deliverableHints: this.toStringArray(opportunity.deliverableHints),
			tonePlaybookText: voice?.tonePlaybookText ?? null,
			senderName: voice?.name ?? null,
			organizationName
		};

		const result = await this.generator.generate(input);

		const { overwrote } = await this.repository.overwriteAfterRegenerate({
			opportunityId,
			body: result.value.body,
			aiCallId: result.callId
		});

		this.logService.logAction({
			action: overwrote ? 'reply_draft.regenerated' : 'reply_draft.regenerate_blocked_sent',
			message: overwrote
				? `Reply draft regenerated for opportunity ${opportunityId} by user ${requestingUserId}`
				: `Reply draft regenerate blocked — already SENT for opportunity ${opportunityId}`,
			metadata: {
				opportunityId,
				organizationId: opportunity.organizationId,
				requestingUserId,
				aiProvider: `${result.provider}/${result.model}`,
				usedTonePlaybook: input.tonePlaybookText !== null,
				bodyLength: result.value.body.length
			},
			context: 'ReplyDraftsService'
		});

		return { overwrote, opportunityFound: true };
	}

	/**
	 * W5.5 — Send the current draft body as a threaded reply via the connected mailbox.
	 *
	 * Sends as the *inbox owner* (the user who connected the mailbox), not the
	 * requesting user. Customer-facing identity matches the conversation they
	 * already had with the inbox; the audit log captures the requesting user
	 * separately so multi-teammate orgs are still attributable.
	 *
	 * Two database mutations after the send succeeds — `ReplyDraft.SENT` +
	 * `Opportunity.REPLIED` — in one transaction so the DB never ends up
	 * disagreeing with the customer's inbox.
	 *
	 * Returns `{ sent, alreadySent, error }`. `alreadySent` is a separate signal
	 * (controller maps to 409) so the FE can render "this was already sent" rather
	 * than a generic error.
	 */
	async send(opportunityId: string, requestingUserId: string): Promise<SendReplyDraftResult> {
		const context = await this.repository.findSendContext(opportunityId);
		if (!context) {
			return { sent: false, alreadySent: false, reason: 'not_found' };
		}

		if (context.status === 'SENT') {
			return { sent: false, alreadySent: true };
		}

		if (!context.emailAccount.inboxOwnerUserId) {
			// EmailAccount.userId is NULL — the user who connected this mailbox has been
			// removed from the org (cascade SET NULL on Membership delete per S17). We
			// can't reissue an access token without a user to scope OAuth on, so refuse
			// the send rather than fall back to some other org member's mailbox.
			this.logService.logAction({
				action: 'reply_draft.send_blocked_no_inbox_owner',
				message: `Cannot send: EmailAccount ${context.emailAccount.id} has no owning user`,
				metadata: { opportunityId, emailAccountId: context.emailAccount.id },
				level: 'warn',
				context: 'ReplyDraftsService'
			});
			return { sent: false, alreadySent: false, reason: 'no_inbox_owner' };
		}

		if (!context.rawMessage.fromEmail) {
			// No recipient address on the original — can't reply. Same orphan shape as
			// no_inbox_owner from the FE's perspective.
			this.logService.logAction({
				action: 'reply_draft.send_blocked_no_recipient',
				message: `Cannot send: original RawMessage for opportunity ${opportunityId} has no fromEmail`,
				metadata: { opportunityId },
				level: 'warn',
				context: 'ReplyDraftsService'
			});
			return { sent: false, alreadySent: false, reason: 'no_inbox_owner' };
		}

		const replyHeaders = extractReplyHeaders({
			provider: context.emailAccount.provider,
			raw: context.rawMessage.raw
		});
		const subject = composeReplySubject(context.rawMessage.subject);
		const recipient = context.rawMessage.fromEmail;

		// W5.5 follow-up — load attachment binaries before opening the OAuth-scoped
		// send block. Pre-loading means a transient storage hiccup fails fast before
		// the token refresh + provider call, and the provider envelope sees a stable
		// snapshot of the attachments even if the DB row changes mid-send (which
		// can't happen — the draft transitions to SENT below — but defense in depth).
		const loadedAttachments = await this.loadAttachmentsForSend(context.attachments);
		const totalAttachmentBytes = loadedAttachments.reduce((sum, a) => sum + a.data.byteLength, 0);
		if (totalAttachmentBytes > ATTACHMENT_MAX_TOTAL_BYTES) {
			// Defense in depth: the upload path already enforces this cap, but a future
			// `spaces`-driver migration could surface size drift between the persisted
			// `sizeBytes` and the actual blob. Refuse before the provider call rather
			// than mid-encode.
			throw new PayloadTooLargeException(
				attachmentTotalTooLarge(totalAttachmentBytes, ATTACHMENT_MAX_TOTAL_BYTES)
			);
		}

		await this.emailAccounts.withFreshAccessToken(
			{
				provider: context.emailAccount.provider,
				organizationId: context.opportunity.organizationId,
				userId: context.emailAccount.inboxOwnerUserId
			},
			async accessToken => {
				if (context.emailAccount.provider === EmailProvider.GMAIL) {
					const rawBase64Url = buildRfc2822Reply({
						to: recipient,
						from: context.emailAccount.email,
						fromName: context.emailAccount.inboxOwnerName,
						subject,
						body: context.body,
						inReplyTo: replyHeaders.messageId,
						references: replyHeaders.references,
						attachments: loadedAttachments.map<BuildRfc2822ReplyAttachment>(a => ({
							filename: a.filename,
							contentType: a.contentType,
							data: a.data
						}))
					});
					await this.gmail.sendMessage(accessToken, {
						rawBase64Url,
						threadId: context.rawMessage.threadId
					});
				} else {
					await this.graph.sendMail(accessToken, {
						toEmail: recipient,
						toName: context.rawMessage.fromName,
						subject,
						body: context.body,
						inReplyTo: replyHeaders.messageId,
						references: replyHeaders.references,
						attachments: loadedAttachments.map(a => ({
							filename: a.filename,
							contentType: a.contentType,
							data: a.data
						}))
					});
				}
			}
		);

		const { draftSentAt } = await this.repository.markSent({ draftId: context.draftId, opportunityId });

		this.logService.logAction({
			action: 'reply_draft.sent',
			message: `Reply sent for opportunity ${opportunityId} via ${context.emailAccount.provider} by user ${requestingUserId}`,
			metadata: {
				opportunityId,
				organizationId: context.opportunity.organizationId,
				emailAccountId: context.emailAccount.id,
				provider: context.emailAccount.provider,
				inboxOwnerUserId: context.emailAccount.inboxOwnerUserId,
				requestingUserId,
				recipient,
				subject,
				hadThreadingHeaders: replyHeaders.messageId !== null,
				bodyLength: context.body.length,
				attachmentCount: loadedAttachments.length,
				attachmentTotalBytes: totalAttachmentBytes
			},
			context: 'ReplyDraftsService'
		});

		return { sent: true, sentAt: draftSentAt };
	}

	/**
	 * Fan out reads of each attachment's binary from the storage backend in parallel.
	 * Returns the same metadata + the raw buffer so the caller can hand it to the
	 * provider envelope builder. We don't stream — every attachment fits comfortably
	 * in memory under the 25 MB cap, and the provider builders need the full buffer
	 * for base64 encoding anyway.
	 */
	private async loadAttachmentsForSend(
		metadata: ReadonlyArray<SendContextAttachment>
	): Promise<Array<SendContextAttachment & { data: Buffer }>> {
		if (metadata.length === 0) {
			return [];
		}
		return Promise.all(
			metadata.map(async row => {
				const { data } = await this.attachmentStorage.get(row.storageKey);
				return { ...row, data };
			})
		);
	}

	private toWireUrgency(urgency: OpportunityForReplyDraftUrgency): ReplyDraftInput['urgency'] {
		switch (urgency) {
			case 'EMERGENCY':
				return 'emergency';
			case 'HIGH':
				return 'high';
			case 'NORMAL':
				return 'normal';
			case 'LOW':
				return 'low';
		}
	}

	private toStringArray(value: unknown): string[] {
		if (!Array.isArray(value)) {
			return [];
		}
		return value.filter((item): item is string => typeof item === 'string');
	}
}

type OpportunityForReplyDraftUrgency = 'EMERGENCY' | 'HIGH' | 'NORMAL' | 'LOW';
