import { ExpiryActionKind } from '@/generated/prisma/enums';
import type { AIClient, AIGenerateResult } from '@/modules/ai/clients/ai-client.interface';
import type {
	ExpiryActionForAuthorization,
	ExpiryCandidate,
	ExpiryRepository
} from '@/modules/expiry/expiry.repository';
import { ExpiryService } from '@/modules/expiry/expiry.service';
import type { ExpirySuggestion } from '@/modules/expiry/expiry-suggestion.types';
import type { LogService } from '@/modules/logger/log.service';
import type { OpportunitiesService } from '@/modules/opportunities/opportunities.service';
import type { ReplyDraftsService } from '@/modules/reply-drafts/reply-drafts.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';

const NOW = new Date('2026-06-09T08:00:00.000Z');

function makeCandidate(overrides: Partial<ExpiryCandidate> = {}): ExpiryCandidate {
	return {
		organizationId: 'org-1',
		opportunityId: 'opp-1',
		quoteDraftId: 'qd-1',
		validUntil: new Date('2026-06-13T08:00:00.000Z'),
		customerName: 'Jan Jansen',
		requestType: 'badkamerrenovatie',
		daysUntilExpiry: 4,
		lastCustomerMessage: 'Bedankt, ik denk er nog over na.',
		...overrides
	};
}

function makeAiResult(value: ExpirySuggestion, callId: string | null): AIGenerateResult<ExpirySuggestion> {
	return { value, provider: 'openai', model: 'gpt-4o-mini', callId };
}

interface Deps {
	repository: {
		isOrganizationEntitled: jest.Mock;
		findExpiryCandidates: jest.Mock;
		insertSuggestion: jest.Mock;
		findLiveForOpportunity: jest.Mock;
		findForAuthorization: jest.Mock;
		claimAsTaken: jest.Mock;
		claimAsDismissed: jest.Mock;
		revertTakenClaim: jest.Mock;
		extendValidUntil: jest.Mock;
		markSupersededForOpportunity: jest.Mock;
	};
	ai: { generate: jest.Mock };
	replyDrafts: { generateFollowupDraft: jest.Mock };
	opportunities: { updateStatus: jest.Mock };
	logService: { logAction: jest.Mock };
}

function makeService(): { service: ExpiryService; deps: Deps } {
	const deps: Deps = {
		repository: {
			// Entitlement defaults to true so the existing expiry tests keep passing.
			isOrganizationEntitled: jest.fn(() => Promise.resolve(true)),
			findExpiryCandidates: jest.fn(),
			insertSuggestion: jest.fn(() => Promise.resolve()),
			findLiveForOpportunity: jest.fn(() => Promise.resolve(null)),
			findForAuthorization: jest.fn(),
			claimAsTaken: jest.fn(() => Promise.resolve(true)),
			claimAsDismissed: jest.fn(() => Promise.resolve(true)),
			revertTakenClaim: jest.fn(() => Promise.resolve(true)),
			extendValidUntil: jest.fn(() => Promise.resolve()),
			markSupersededForOpportunity: jest.fn(() => Promise.resolve())
		},
		ai: { generate: jest.fn() },
		replyDrafts: { generateFollowupDraft: jest.fn(() => Promise.resolve({ created: true, draftId: 'd-1' })) },
		opportunities: { updateStatus: jest.fn(() => Promise.resolve({})) },
		logService: { logAction: jest.fn() }
	};

	const service = new ExpiryService(
		deps.repository as unknown as ExpiryRepository,
		deps.ai as unknown as AIClient,
		deps.replyDrafts as unknown as ReplyDraftsService,
		deps.opportunities as unknown as OpportunitiesService,
		deps.logService as unknown as LogService
	);

	return { service, deps };
}

describe('ExpiryService', () => {
	describe('runWatcher', () => {
		it('inserts one suggestion per candidate with the AI fields + callId', async () => {
			const { service, deps } = makeService();
			const candidate = makeCandidate();
			deps.repository.findExpiryCandidates.mockReturnValue(Promise.resolve([candidate]));
			deps.ai.generate.mockReturnValue(
				Promise.resolve(makeAiResult({ recommendedAction: 'LAST_FOLLOWUP', suggestedCopy: 'x' }, 'call-1'))
			);

			const result = await service.runWatcher(NOW);

			expect(deps.ai.generate).toHaveBeenCalledTimes(1);
			expect(deps.repository.insertSuggestion).toHaveBeenCalledTimes(1);
			expect(deps.repository.insertSuggestion).toHaveBeenCalledWith({
				organizationId: candidate.organizationId,
				opportunityId: candidate.opportunityId,
				quoteDraftId: candidate.quoteDraftId,
				validUntil: candidate.validUntil,
				recommendedAction: 'LAST_FOLLOWUP',
				suggestedCopy: 'x',
				aiCallId: 'call-1'
			});
			expect(result).toEqual({ scanned: 1, inserted: 1 });
		});

		it('skips the insert but still counts the scan when the AI call throws', async () => {
			const { service, deps } = makeService();
			deps.repository.findExpiryCandidates.mockReturnValue(Promise.resolve([makeCandidate()]));
			deps.ai.generate.mockReturnValue(Promise.reject(new Error('boom')));

			const result = await service.runWatcher(NOW);

			expect(deps.repository.insertSuggestion).not.toHaveBeenCalled();
			expect(result).toEqual({ scanned: 1, inserted: 0 });
			expect(deps.logService.logAction).toHaveBeenCalledWith(
				expect.objectContaining({ action: 'expiry.watcher.suggestion_failed', level: 'warn' })
			);
		});

		it('processes candidates in parallel batches capped at 5 in-flight AI calls', async () => {
			const { service, deps } = makeService();
			const candidates = Array.from({ length: 7 }, (_, i) =>
				makeCandidate({ opportunityId: `opp-${i}`, quoteDraftId: `qd-${i}` })
			);
			deps.repository.findExpiryCandidates.mockReturnValue(Promise.resolve(candidates));

			let inFlight = 0;
			let maxInFlight = 0;
			deps.ai.generate.mockImplementation(async () => {
				inFlight += 1;
				maxInFlight = Math.max(maxInFlight, inFlight);
				await new Promise(resolve => setImmediate(resolve));
				inFlight -= 1;
				return makeAiResult({ recommendedAction: 'LAST_FOLLOWUP', suggestedCopy: 'x' }, null);
			});

			const result = await service.runWatcher(NOW);

			expect(result).toEqual({ scanned: 7, inserted: 7 });
			expect(maxInFlight).toBeLessThanOrEqual(5);
			expect(maxInFlight).toBeGreaterThan(1);
		});

		it('inserts nothing when the repository candidate gate returns no rows (idempotency)', async () => {
			const { service, deps } = makeService();
			deps.repository.findExpiryCandidates.mockReturnValue(Promise.resolve([]));

			const result = await service.runWatcher(NOW);

			expect(deps.ai.generate).not.toHaveBeenCalled();
			expect(deps.repository.insertSuggestion).not.toHaveBeenCalled();
			expect(result).toEqual({ scanned: 0, inserted: 0 });
		});
	});

	describe('takeAction', () => {
		const action: ExpiryActionForAuthorization = {
			opportunityId: 'opp-1',
			quoteDraftId: 'qd-1'
		};

		it('EXTEND_14D claims the action, extends validity atomically, supersedes siblings', async () => {
			const { service, deps } = makeService();
			deps.repository.findForAuthorization.mockReturnValue(Promise.resolve(action));

			await service.takeAction('ea-1', 'org-1', 'user-1', ExpiryActionKind.EXTEND_14D);

			// Claim is the only TAKEN write — there is no separate markTaken anymore.
			expect(deps.repository.claimAsTaken).toHaveBeenCalledWith('ea-1', ExpiryActionKind.EXTEND_14D, 'user-1');
			// Atomic interval bump runs through the dedicated repo method, not a read-then-write.
			expect(deps.repository.extendValidUntil).toHaveBeenCalledWith('qd-1');
			expect(deps.repository.markSupersededForOpportunity).toHaveBeenCalledWith('opp-1', 'ea-1');
		});

		it('LAST_FOLLOWUP and MARK_LOST also supersede siblings (fix #2)', async () => {
			const { service, deps } = makeService();
			deps.repository.findForAuthorization.mockReturnValue(Promise.resolve(action));

			await service.takeAction('ea-1', 'org-1', 'user-1', ExpiryActionKind.LAST_FOLLOWUP);
			expect(deps.replyDrafts.generateFollowupDraft).toHaveBeenCalledWith('opp-1', 'user-1', 'owner_compose');
			expect(deps.repository.markSupersededForOpportunity).toHaveBeenCalledWith('opp-1', 'ea-1');

			deps.repository.markSupersededForOpportunity.mockClear();

			await service.takeAction('ea-1', 'org-1', 'user-1', ExpiryActionKind.MARK_LOST);
			expect(deps.opportunities.updateStatus).toHaveBeenCalledWith('org-1', 'opp-1', 'lost', 'user-1');
			expect(deps.repository.markSupersededForOpportunity).toHaveBeenCalledWith('opp-1', 'ea-1');
		});

		it('throws NotFound when the action is not in the org', async () => {
			const { service, deps } = makeService();
			deps.repository.findForAuthorization.mockReturnValue(Promise.resolve(null));

			await expect(
				service.takeAction('ea-1', 'org-1', 'user-1', ExpiryActionKind.MARK_LOST)
			).rejects.toBeInstanceOf(NotFoundException);
			expect(deps.repository.claimAsTaken).not.toHaveBeenCalled();
		});

		it('throws and runs no side-effect when the claim is lost (already resolved / race)', async () => {
			const { service, deps } = makeService();
			deps.repository.findForAuthorization.mockReturnValue(Promise.resolve(action));
			deps.repository.claimAsTaken.mockReturnValue(Promise.resolve(false));

			await expect(
				service.takeAction('ea-1', 'org-1', 'user-1', ExpiryActionKind.MARK_LOST)
			).rejects.toBeInstanceOf(BadRequestException);
			expect(deps.opportunities.updateStatus).not.toHaveBeenCalled();
			expect(deps.replyDrafts.generateFollowupDraft).not.toHaveBeenCalled();
			expect(deps.repository.extendValidUntil).not.toHaveBeenCalled();
			expect(deps.repository.markSupersededForOpportunity).not.toHaveBeenCalled();
		});

		it('reverts the claim and rethrows when the side-effect fails, so the owner can retry', async () => {
			const { service, deps } = makeService();
			deps.repository.findForAuthorization.mockReturnValue(Promise.resolve(action));
			deps.replyDrafts.generateFollowupDraft.mockReturnValue(Promise.reject(new Error('openai down')));

			await expect(service.takeAction('ea-1', 'org-1', 'user-1', ExpiryActionKind.LAST_FOLLOWUP)).rejects.toThrow(
				'openai down'
			);
			expect(deps.repository.revertTakenClaim).toHaveBeenCalledWith('ea-1');
			// The window is not resolved — siblings must stay live.
			expect(deps.repository.markSupersededForOpportunity).not.toHaveBeenCalled();
			expect(deps.logService.logAction).toHaveBeenCalledWith(
				expect.objectContaining({ action: 'expiry.action.claim_reverted', level: 'warn' })
			);
		});

		it('still rethrows the side-effect error when the revert itself fails (draft stays locked)', async () => {
			const { service, deps } = makeService();
			deps.repository.findForAuthorization.mockReturnValue(Promise.resolve(action));
			deps.repository.extendValidUntil.mockReturnValue(Promise.reject(new Error('db down')));
			deps.repository.revertTakenClaim.mockReturnValue(Promise.reject(new Error('still down')));

			await expect(service.takeAction('ea-1', 'org-1', 'user-1', ExpiryActionKind.EXTEND_14D)).rejects.toThrow(
				'db down'
			);
			expect(deps.logService.logAction).toHaveBeenCalledWith(
				expect.objectContaining({ action: 'expiry.action.claim_revert_failed', level: 'error' })
			);
		});
	});

	describe('dismiss', () => {
		const action: ExpiryActionForAuthorization = {
			opportunityId: 'opp-1',
			quoteDraftId: 'qd-1'
		};

		it('claims the action as dismissed and logs', async () => {
			const { service, deps } = makeService();
			deps.repository.findForAuthorization.mockReturnValue(Promise.resolve(action));

			await service.dismiss('ea-1', 'org-1', 'user-1');

			expect(deps.repository.claimAsDismissed).toHaveBeenCalledWith('ea-1');
			expect(deps.logService.logAction).toHaveBeenCalledWith(
				expect.objectContaining({ action: 'expiry.action.dismissed' })
			);
		});

		it('throws and does no further work when the claim is lost (race / already resolved)', async () => {
			const { service, deps } = makeService();
			deps.repository.findForAuthorization.mockReturnValue(Promise.resolve(action));
			deps.repository.claimAsDismissed.mockReturnValue(Promise.resolve(false));

			await expect(service.dismiss('ea-1', 'org-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
			expect(deps.logService.logAction).not.toHaveBeenCalled();
		});
	});

	describe('getForOpportunity', () => {
		it('scopes the lookup to the org by passing both opportunityId and organizationId', async () => {
			const { service, deps } = makeService();

			await service.getForOpportunity('opp-1', 'org-1');

			expect(deps.repository.findLiveForOpportunity).toHaveBeenCalledWith('opp-1', 'org-1');
		});

		it('returns null for a non-entitled org without reading the live suggestion', async () => {
			const { service, deps } = makeService();
			deps.repository.isOrganizationEntitled.mockReturnValue(Promise.resolve(false));

			const result = await service.getForOpportunity('opp-1', 'org-1');

			expect(result).toBeNull();
			expect(deps.repository.findLiveForOpportunity).not.toHaveBeenCalled();
		});
	});
});
