import type { PurgeIngestedDataResult } from '@offertum/shared';

/**
 * Response for `DELETE /api/me/organization/data` — counts of what the purge removed.
 * Mailbox connections, catalog / pricing config, and AI-call audit rows are kept.
 */
export class PurgeIngestedDataResponseDto implements PurgeIngestedDataResult {
	deletedOpportunities!: number;
	deletedRawMessages!: number;
	deletedNotifications!: number;
}
