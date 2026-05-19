import { buildRawMessageAIInput } from '@/lib/email/raw-message-ai-input';
import { ReplyDraftGenerator } from '@/modules/ai/reply-draft/reply-draft-generator.service';
import type { ReplyDraftInput } from '@/modules/ai/reply-draft/reply-draft.types';
import { LogService } from '@/modules/logger/log.service';
import { ReplyDraftsRepository } from '@/modules/reply-drafts/reply-drafts.repository';
import { Injectable } from '@nestjs/common';

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
@Injectable()
export class ReplyDraftsService {
	constructor(
		private readonly repository: ReplyDraftsRepository,
		private readonly generator: ReplyDraftGenerator,
		private readonly logService: LogService
	) {}

	async upsertFromOpportunity(opportunityId: string): Promise<{
		created: boolean;
		alreadyExisted: boolean;
	}> {
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
	 * W5.4 — Regenerate the draft for an opportunity using the *requesting user's*
	 * `tonePlaybookText` (not the org OWNER's, unlike `upsertFromOpportunity`). Powers
	 * the "Regenereer in mijn stijl" button. Refuses to overwrite a SENT draft (the
	 * email is already out the door). Returns `{ overwrote: false }` in that case so
	 * the controller can surface 409 to the FE.
	 */
	async regenerate(
		opportunityId: string,
		requestingUserId: string
	): Promise<{ overwrote: boolean; opportunityFound: boolean }> {
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
