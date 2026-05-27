import type { EnvSchema } from '@/config/env.schema';
import { MembershipRole } from '@/generated/prisma/client';
import { CANNOT_REMOVE_OWNER, CANNOT_REMOVE_SELF, MEMBERSHIP_NOT_FOUND } from '@/lib/errors';
import { BillingService } from '@/modules/billing/billing.service';
import { LogService } from '@/modules/logger/log.service';
import { MembershipResponseDto } from '@/modules/me/dto/membership.response.dto';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BusinessDetails, FollowUpSettings, TonePlaybook, UpdateBusinessDetailsInput } from '@offertum/shared';

/**
 * Reads + writes scoped to the current user. Controller stays thin — orchestrates
 * `request.organizationId` (set by OrganizationGuard) and `request.authSession.user.id`
 * into these methods and returns the result.
 */
@Injectable()
export class MeService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly billing: BillingService,
		private readonly logService: LogService,
		private readonly config: ConfigService<EnvSchema, true>
	) {}

	private static readonly MEMBERSHIP_INCLUDE = {
		// `tonePlaybookText` is selected only so we can derive the `hasTonePlaybook`
		// boolean — the actual prose never leaves this service, so the per-request
		// payload doesn't carry the (potentially multi-kB) text on every page load.
		// `tonePlaybookUpdatedAt` is the dedicated timestamp that drives the
		// "your writing style was updated since this draft was generated" banner.
		user: {
			select: {
				id: true,
				email: true,
				name: true,
				tonePlaybookText: true,
				tonePlaybookUpdatedAt: true
			}
		},
		organization: { select: { id: true, name: true } }
	} as const;

	/** All members of the given org (teammates of the current user). `isAdmin` is always
	 * `false` here — admin status is per-user metadata that we deliberately don't expose
	 * across the team listing. The current user's admin flag is on `findMyMembership`. */
	async listOrgMembers(organizationId: string): Promise<MembershipResponseDto[]> {
		const rows = await this.prisma.membership.findMany({
			where: { organizationId },
			include: MeService.MEMBERSHIP_INCLUDE
		});
		return rows.map(row => this.toMembershipResponse(row, false));
	}

	/** The current user's single membership in the active org. `isAdmin` is computed from
	 * the `ADMIN_EMAILS` env allowlist so the web can gate dev/admin routes without
	 * shipping the allowlist to the browser. */
	async findMyMembership(userId: string, organizationId: string): Promise<MembershipResponseDto> {
		const membership = await this.prisma.membership.findFirst({
			where: { userId, organizationId },
			include: MeService.MEMBERSHIP_INCLUDE
		});

		if (!membership) {
			throw new NotFoundException(MEMBERSHIP_NOT_FOUND);
		}

		return this.toMembershipResponse(membership, this.isAdminEmail(membership.user.email));
	}

	/** All orgs the current user belongs to — drives the org switcher dropdown. Every row
	 * shares the same `user` (the requester themselves), so `isAdmin` is meaningful. */
	async listMyOrganizations(userId: string): Promise<MembershipResponseDto[]> {
		const rows = await this.prisma.membership.findMany({
			where: { userId },
			orderBy: { createdAt: 'asc' },
			include: MeService.MEMBERSHIP_INCLUDE
		});
		return rows.map(row => this.toMembershipResponse(row, this.isAdminEmail(row.user.email)));
	}

	private isAdminEmail(email: string | null | undefined): boolean {
		if (!email) {
			return false;
		}
		const raw = this.config.get('ADMIN_EMAILS', { infer: true });
		if (!raw) {
			return false;
		}
		const target = email.toLowerCase();
		return raw
			.split(',')
			.map(s => s.trim().toLowerCase())
			.some(allowed => allowed.length > 0 && allowed === target);
	}

	/**
	 * Project Prisma's raw membership row into the wire DTO shape. Strips
	 * `tonePlaybookText` (selected only so we can derive `hasTonePlaybook`) so the
	 * playbook prose never leaves this service; the FE only needs the boolean to
	 * render the just-in-time banner in the draft editor.
	 */
	private toMembershipResponse(
		row: {
			id: string;
			userId: string;
			organizationId: string;
			role: MembershipRole;
			createdAt: Date;
			updatedAt: Date;
			user: {
				id: string;
				email: string;
				name: string | null;
				tonePlaybookText: string | null;
				tonePlaybookUpdatedAt: Date | null;
			};
			organization: { id: string; name: string };
		},
		isAdmin: boolean
	): MembershipResponseDto {
		const { tonePlaybookText, tonePlaybookUpdatedAt, ...userRest } = row.user;
		const hasTonePlaybook = tonePlaybookText !== null && tonePlaybookText.trim().length > 0;
		return {
			...row,
			user: {
				...userRest,
				isAdmin,
				hasTonePlaybook,
				tonePlaybookUpdatedAt: tonePlaybookUpdatedAt?.toISOString() ?? null
			}
		};
	}

	/**
	 * Read the current user's writing-style playbook. Returns the prose + the
	 * dedicated `tonePlaybookUpdatedAt` timestamp (when the playbook itself last
	 * changed, distinct from `User.updatedAt` which moves on any User-row write).
	 * When the user has never authored a playbook, `updatedAt` is `null`.
	 */
	async getTonePlaybook(userId: string): Promise<TonePlaybook> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { tonePlaybookText: true, tonePlaybookUpdatedAt: true }
		});

		if (!user) {
			throw new NotFoundException(MEMBERSHIP_NOT_FOUND);
		}

		return {
			text: user.tonePlaybookText,
			updatedAt: user.tonePlaybookUpdatedAt?.toISOString() ?? null
		};
	}

	/**
	 * Update the current user's writing-style playbook. Empty / whitespace-only
	 * `text` clears the playbook AND nulls out `tonePlaybookUpdatedAt` (back to generic
	 * baseline). The org doesn't need to be entitled to write this — it's a personal
	 * preference, not a tenant-write — but controller still goes through `AuthGuard`
	 * so it requires a valid session.
	 */
	async updateTonePlaybook(userId: string, text: string): Promise<TonePlaybook> {
		const trimmed = text.trim();
		const next = trimmed.length === 0 ? null : trimmed;

		const updated = await this.prisma.user.update({
			where: { id: userId },
			data: {
				tonePlaybookText: next,
				// Dedicated timestamp so the "regenerate?" banner only fires when
				// the playbook itself changed, not on unrelated User-row writes. NULL on
				// clear so the banner can't fire after the user wipes their playbook.
				tonePlaybookUpdatedAt: next === null ? null : new Date()
			},
			select: { tonePlaybookText: true, tonePlaybookUpdatedAt: true }
		});

		this.logService.logAction({
			action: next === null ? 'tone_playbook.cleared' : 'tone_playbook.updated',
			message: `User ${userId} ${next === null ? 'cleared' : 'updated'} their writing-style playbook`,
			metadata: {
				userId,
				length: next?.length ?? 0
			},
			context: 'MeService'
		});

		return {
			text: updated.tonePlaybookText,
			updatedAt: updated.tonePlaybookUpdatedAt?.toISOString() ?? null
		};
	}

	/**
	 * Read the active org's follow-up cadence + cap. Surfaced to OWNER only at
	 * the controller layer; the service itself doesn't care who's asking — the
	 * `OrganizationGuard` has already proven membership.
	 */
	async getFollowUpSettings(organizationId: string): Promise<FollowUpSettings> {
		const row = await this.prisma.organization.findUniqueOrThrow({
			where: { id: organizationId },
			select: { followUpCadenceDays: true, followUpMaxCount: true, coldAfterDays: true }
		});
		return {
			cadenceDays: row.followUpCadenceDays,
			maxCount: row.followUpMaxCount,
			coldAfterDays: row.coldAfterDays
		};
	}

	/**
	 * Update the active org's follow-up cadence + cap + cold-after-days. Owner-only at
	 * the controller layer. Same persistence pattern as `updateTonePlaybook`: write,
	 * then audit-log. No need to reschedule existing per-opp timers — both the
	 * silence-check-in scheduler and the auto-cold cron recompute eligibility from
	 * the org row on every tick, so changes apply automatically on the next run.
	 */
	async updateFollowUpSettings(
		actingUserId: string,
		organizationId: string,
		input: { cadenceDays: number; maxCount: number; coldAfterDays: number }
	): Promise<FollowUpSettings> {
		const updated = await this.prisma.organization.update({
			where: { id: organizationId },
			data: {
				followUpCadenceDays: input.cadenceDays,
				followUpMaxCount: input.maxCount,
				coldAfterDays: input.coldAfterDays
			},
			select: { followUpCadenceDays: true, followUpMaxCount: true, coldAfterDays: true }
		});

		this.logService.logAction({
			action: 'organization.follow_up_settings_updated',
			message: `Follow-up settings updated for org ${organizationId} → cadence=${input.cadenceDays}d, cap=${input.maxCount}, coldAfter=${input.coldAfterDays}d`,
			metadata: {
				organizationId,
				updatedBy: actingUserId,
				cadenceDays: input.cadenceDays,
				maxCount: input.maxCount,
				coldAfterDays: input.coldAfterDays
			},
			context: 'MeService'
		});

		return {
			cadenceDays: updated.followUpCadenceDays,
			maxCount: updated.followUpMaxCount,
			coldAfterDays: updated.coldAfterDays
		};
	}

	/**
	 * Read the active org's customer-facing business details (legal name, KvK, VAT,
	 * address, footer, default payment terms). `hasLogo` is derived from
	 * `logoStorageKey != null` so the FE can render the "no logo" placeholder
	 * without a second round-trip.
	 */
	async getBusinessDetails(organizationId: string): Promise<BusinessDetails> {
		const row = await this.prisma.organization.findUniqueOrThrow({
			where: { id: organizationId },
			select: {
				name: true,
				companyRegistrationNumber: true,
				companyVatNumber: true,
				companyAddress: true,
				companyFooter: true,
				defaultPaymentTermsDays: true,
				logoStorageKey: true
			}
		});

		return {
			name: row.name,
			companyRegistrationNumber: row.companyRegistrationNumber,
			companyVatNumber: row.companyVatNumber,
			companyAddress: row.companyAddress,
			companyFooter: row.companyFooter,
			defaultPaymentTermsDays: row.defaultPaymentTermsDays,
			hasLogo: row.logoStorageKey !== null
		};
	}

	/**
	 * Update the active org's business details. Owner-only at the controller layer.
	 * Empty / whitespace-only strings collapse to `null` so the DB never stores `""`
	 * (mirrors the catalog-items pattern). `undefined` fields are left untouched.
	 */
	async updateBusinessDetails(
		actingUserId: string,
		organizationId: string,
		input: UpdateBusinessDetailsInput
	): Promise<BusinessDetails> {
		const normalized: Record<string, string | number | null> = {};

		// `name` is non-nullable (Organization.name DB column). The DTO's MinLength(1)
		// + trim here keep the column from being filled with whitespace-only garbage.
		if (input.name !== undefined) {
			const trimmed = input.name.trim();
			if (trimmed.length > 0) {
				normalized.name = trimmed;
			}
		}
		if (input.companyRegistrationNumber !== undefined) {
			normalized.companyRegistrationNumber = normalizeBusinessText(input.companyRegistrationNumber);
		}
		if (input.companyVatNumber !== undefined) {
			normalized.companyVatNumber = normalizeBusinessText(input.companyVatNumber);
		}
		if (input.companyAddress !== undefined) {
			normalized.companyAddress = normalizeBusinessText(input.companyAddress);
		}
		if (input.companyFooter !== undefined) {
			normalized.companyFooter = normalizeBusinessText(input.companyFooter);
		}
		if (input.defaultPaymentTermsDays !== undefined) {
			normalized.defaultPaymentTermsDays = input.defaultPaymentTermsDays;
		}

		const updated = await this.prisma.organization.update({
			where: { id: organizationId },
			data: normalized,
			select: {
				name: true,
				companyRegistrationNumber: true,
				companyVatNumber: true,
				companyAddress: true,
				companyFooter: true,
				defaultPaymentTermsDays: true,
				logoStorageKey: true
			}
		});

		this.logService.logAction({
			action: 'organization.business_details_updated',
			message: `Business details updated for org ${organizationId}`,
			metadata: {
				organizationId,
				updatedBy: actingUserId,
				updatedKeys: Object.keys(normalized)
			},
			context: 'MeService'
		});

		// Push the new name to Stripe when the owner edits it here. Idempotent at
		// the BillingService layer — only fires the Stripe API call if the value
		// actually differs from what Stripe has. Skipped for orgs that haven't
		// reached Checkout yet (no Stripe customer to update).
		if (input.name !== undefined) {
			await this.billing.syncCustomerNameForOrg(organizationId);
		}

		return {
			name: updated.name,
			companyRegistrationNumber: updated.companyRegistrationNumber,
			companyVatNumber: updated.companyVatNumber,
			companyAddress: updated.companyAddress,
			companyFooter: updated.companyFooter,
			defaultPaymentTermsDays: updated.defaultPaymentTermsDays,
			hasLogo: updated.logoStorageKey !== null
		};
	}

	/**
	 * Pin `User.currentOrganizationId` to the target. Validates the user actually has
	 * a membership there — otherwise anyone could pin themselves to any org by UUID.
	 * Returns the membership in the new org so the caller can update its UI.
	 */
	async switchActiveOrganization(userId: string, targetOrganizationId: string): Promise<MembershipResponseDto> {
		const membership = await this.findMyMembership(userId, targetOrganizationId);

		await this.prisma.user.update({
			where: { id: userId },
			data: { currentOrganizationId: targetOrganizationId }
		});

		return membership;
	}

	/**
	 * Remove a member from the active organization. Owner-only at the controller layer
	 * (`@UseGuards(OwnerGuard)`). Does NOT require entitlement — an org that's canceled or
	 * past_due should still be able to clean up its team.
	 * Business rules:
	 *  - You cannot remove yourself (would orphan the org for the sole owner).
	 *  - You cannot remove the OWNER role. Defensive: one owner per org today, and
	 *    ownership-transfer is a separate flow if multi-owner ever lands.
	 *  - Cascade-deletes the target user's `EmailAccount` rows scoped to this org so their
	 *    mailbox access doesn't outlive their membership. Prisma onDelete chain clears
	 *    `RawMessage` too.
	 *  - Re-points `User.currentOrganizationId` if the removed user had this org pinned —
	 *    moves them to their oldest remaining membership, or null if they have none.
	 *  - Best-effort `billing.syncSeatCount` after the tx commits. Pattern matches
	 *    `InvitationsService.accept`.
	 */
	async removeMember(actingUserId: string, organizationId: string, targetUserId: string): Promise<void> {
		if (actingUserId === targetUserId) {
			throw new BadRequestException(CANNOT_REMOVE_SELF);
		}

		const target = await this.prisma.membership.findFirst({
			where: { userId: targetUserId, organizationId },
			include: { user: { select: { id: true, email: true, currentOrganizationId: true } } }
		});

		if (!target) {
			throw new NotFoundException(MEMBERSHIP_NOT_FOUND);
		}

		if (target.role === MembershipRole.OWNER) {
			throw new ConflictException(CANNOT_REMOVE_OWNER);
		}

		await this.prisma.$transaction(async tx => {
			await tx.membership.delete({ where: { id: target.id } });

			// Disconnect the removed user's mailboxes scoped to this org. The cascade FK on
			// `EmailAccount.organizationId → Organization` and the `RawMessage` cascade clear
			// dependent rows. We don't call the provider's revoke endpoint — admin-driven
			// removes are different from user-driven disconnects; the tokens go inert once
			// the row is gone, and Gmail's watch (if any) expires within 7 days on its own.
			await tx.emailAccount.deleteMany({
				where: { userId: targetUserId, organizationId }
			});

			// If the removed user had this org as their active one, switch them to their
			// oldest remaining membership. If they have none, set null — they'll see the
			// "no active organization" state on next request, which is the correct UX for
			// a user who's no longer in any org.
			if (target.user.currentOrganizationId === organizationId) {
				const fallback = await tx.membership.findFirst({
					where: { userId: targetUserId, organizationId: { not: organizationId } },
					orderBy: { createdAt: 'asc' },
					select: { organizationId: true }
				});

				await tx.user.update({
					where: { id: targetUserId },
					data: { currentOrganizationId: fallback?.organizationId ?? null }
				});
			}
		});

		// Reconcile billed quantity after the tx commits. Best-effort: if Stripe is briefly
		// unreachable, the remove already happened — the next invitation accept (or a
		// webhook-driven re-sync) will fix the drift.
		await this.billing.syncSeatCount(organizationId);

		this.logService.logAction({
			action: 'membership.removed',
			message: `${target.user.email} removed from org ${organizationId}`,
			metadata: {
				organizationId,
				removedUserId: targetUserId,
				removedEmail: target.user.email,
				removedRole: target.role,
				removedBy: actingUserId
			},
			context: 'MeService'
		});
	}
}

/** Trim + collapse empty strings to `null` so the DB never stores `""`. */
function normalizeBusinessText(value: string | null): string | null {
	if (value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}
