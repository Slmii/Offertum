/**
 * Per-org VAT configuration (W-VAT). Rate options are no longer hardcoded NL presets — each org
 * keeps its own allowed rates so the app can serve other countries. The reverse-charge mechanism
 * stays a per-line boolean (`QuoteLineItem.vatReverseCharged`); only whether the option is offered
 * and its label are configurable.
 *
 * Single source of truth for the VAT select options, consumed by the quote-line VAT dropdown
 * (rates + a reverse-charge option) and the catalog-item BTW dropdown (rates only).
 */

export interface OrgVatConfig {
	/** Allowed VAT rates (percentages), in display order. */
	rates: number[];
	/** Preselected rate for a new quote line / catalog item. Should be ∈ rates. */
	defaultRate: number;
	reverseChargeEnabled: boolean;
	/** Label for the reverse-charge option (NL: "BTW verlegd"; renameable for other locales). */
	reverseChargeLabel: string;
}

/** Fallback when an org hasn't configured VAT yet (empty `vatRates`). */
export const DEFAULT_NL_VAT_CONFIG: OrgVatConfig = {
	rates: [21, 9, 0],
	defaultRate: 21,
	reverseChargeEnabled: true,
	reverseChargeLabel: 'BTW verlegd'
};

export const VAT_RATE_MIN = 0;
export const VAT_RATE_MAX = 100;
export const VAT_RATE_MAX_DECIMALS = 2;
export const VAT_RATES_MAX_COUNT = 12;
export const VAT_REVERSE_CHARGE_LABEL_MAX_LENGTH = 60;

/** Stable option id for the reverse-charge ("verlegd") choice on the quote-line VAT select. */
export const VAT_REVERSE_CHARGE_OPTION_ID = 'reverse';

export interface VatSelectOption {
	id: string;
	label: string;
	icon?: string;
}

/** Format a numeric rate as a percentage label, NL-style: 21 → "21%", 5.5 → "5,5%". */
export function formatVatRateLabel(rate: number): string {
	return `${String(rate).replace('.', ',')}%`;
}

/** Stable option id for a numeric rate (the rate itself as a string). */
function rateOptionId(rate: number): string {
	return String(rate);
}

/**
 * Quote-line VAT options: each allowed rate, plus a reverse-charge option when enabled. The
 * reverse-charge option's id is {@link VAT_REVERSE_CHARGE_OPTION_ID}; a numeric id maps to that
 * `vatRate` with `vatReverseCharged: false`.
 */
export function buildQuoteVatOptions(config: OrgVatConfig): VatSelectOption[] {
	const options: VatSelectOption[] = config.rates.map(rate => ({
		id: rateOptionId(rate),
		label: formatVatRateLabel(rate)
	}));
	if (config.reverseChargeEnabled) {
		options.push({ id: VAT_REVERSE_CHARGE_OPTION_ID, label: config.reverseChargeLabel });
	}
	return options;
}

/** Catalog-item BTW options: rates only (catalog items have no reverse-charge concept). */
export function buildCatalogVatOptions(config: OrgVatConfig): VatSelectOption[] {
	return config.rates.map(rate => ({ id: rateOptionId(rate), label: formatVatRateLabel(rate) }));
}

/** Resolve a quote-line VAT select id back to the line's VAT fields. */
export function quoteVatOptionToLine(id: string): { vatRate: number; vatReverseCharged: boolean } {
	if (id === VAT_REVERSE_CHARGE_OPTION_ID) {
		return { vatRate: 0, vatReverseCharged: true };
	}
	return { vatRate: Number(id), vatReverseCharged: false };
}

/** The select id representing a line's current VAT state. */
export function quoteVatLineToOptionId(line: { vatRate: number; vatReverseCharged: boolean }): string {
	return line.vatReverseCharged ? VAT_REVERSE_CHARGE_OPTION_ID : rateOptionId(line.vatRate);
}
