/**
 * Counters returned by the opportunity-processing pipeline. Shared between
 * `OpportunitiesService.processBatch` (one Inngest step's worth of work) and
 * `processOpportunitiesInBatches` (the Inngest-side loop that aggregates batches).
 *
 * Lives in its own file because the result shape crosses the service ↔ Inngest boundary
 * — keeping it next to the service implementation would force the Inngest helper to
 * import the service just for the type, creating an awkward cycle.
 */
export interface OpportunityProcessingResult {
	emailAccountId: string;
	scanned: number;
	classifiedPositive: number;
	classifiedNegative: number;
	opportunitiesCreated: number;
	opportunitiesSkipped: number;
	failed: number;
}

export interface OpportunityProcessingBatchResult {
	result: OpportunityProcessingResult;
	failedRawMessageIds: string[];
	exhausted: boolean;
}

/**
 * Inngest function-level safety cap on how many sequential `processBatch` steps we'll
 * dispatch for one trigger. At `PROCESS_BATCH_SIZE = 25` this caps a single pass at
 * 5,000 RawMessages — well above the ~1,000-message upper bound of a real SMB Gmail/Graph
 * 90-day backfill. If a mailbox somehow exceeds this we log
 * `opportunity.pipeline.batch_cap_reached` and the next sync run picks up the remainder.
 */
export const PROCESS_MAX_BATCHES_PER_RUN = 200;
