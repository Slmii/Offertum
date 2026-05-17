/**
 * Per-million-token rates for the AI models Quoteom calls. Used by `AIUsageService` to
 * compute USD cost from `AICall.promptTokens` + `completionTokens`. **Keep this in sync
 * with the providers' published prices** — OpenAI revises rates a couple of times a year
 * and Azure occasionally follows.
 *
 * Source: https://openai.com/api/pricing/ — verified 2026-05-17. Update the timestamp
 * below when you re-verify so future readers can tell at a glance whether the numbers
 * may have drifted.
 *
 * Azure OpenAI: pay-as-you-go billing is typically priced identically to direct OpenAI
 * for the same model. PTU (Provisioned Throughput Units) pricing is different and not
 * usage-billed by token, so this table is irrelevant for PTU. Quoteom uses pay-as-you-go.
 *
 * Cost formula: `(promptTokens * inputPerMillionUsd + completionTokens * outputPerMillionUsd) / 1_000_000`.
 *
 * For models NOT in this table, the service falls back to `UNKNOWN_MODEL_RATE` so cost
 * still aggregates as a (likely under-estimated) number — better than 0 — and the model
 * surfaces in the "unpriced" footnote of the dashboard so we know to add it.
 */
export interface ModelRate {
	inputPerMillionUsd: number;
	outputPerMillionUsd: number;
}

/** Keyed by the exact `AICall.model` string (matches what the SDK reports). */
export const MODEL_RATES: Record<string, ModelRate> = {
	// OpenAI flagship models
	'gpt-4o': { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10.0 },
	'gpt-4o-mini': { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },

	// Reasoning models (priced higher; used if we ever route a hard extraction through o1/o3)
	'o1-mini': { inputPerMillionUsd: 1.1, outputPerMillionUsd: 4.4 },
	'o3-mini': { inputPerMillionUsd: 1.1, outputPerMillionUsd: 4.4 }
};

/**
 * Fallback rate for unrecognised models — same as `gpt-4o` so cost estimates lean
 * conservative (rather than zero, which would silently hide cost from the dashboard).
 * Whenever this fires, the dashboard footnote calls out which model needs adding here.
 */
export const UNKNOWN_MODEL_RATE: ModelRate = { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10.0 };

export function rateFor(model: string): { rate: ModelRate; known: boolean } {
	const rate = MODEL_RATES[model];
	if (rate) {
		return { rate, known: true };
	}
	return { rate: UNKNOWN_MODEL_RATE, known: false };
}

export function calculateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
	const { rate } = rateFor(model);
	return (promptTokens * rate.inputPerMillionUsd + completionTokens * rate.outputPerMillionUsd) / 1_000_000;
}
