/**
 * Per-org VAT configuration (W-VAT). Rate options are no longer hardcoded NL presets — each org
 * keeps its own allowed rates so the app can serve other countries. Each rate is a named,
 * categorised option that can be individually (de)activated; the reverse-charge mechanism stays a
 * per-line boolean (`QuoteLineItem.vatReverseCharged`) — only whether the option is offered and its
 * label are configurable, so it lives as the two top-level `reverseCharge*` fields, not as a rate.
 *
 * Single source of truth for the VAT select options, consumed by the quote-line VAT dropdown
 * (active rates + a reverse-charge option) and the catalog-item BTW dropdown (active rates only).
 */

/** VAT rate category — drives the row badge, the hint copy, and a suggested percentage. */
export type VatRateKind = 'standard' | 'reduced' | 'zero';

export interface VatRateOption {
	/** Stable, opaque id (client-generated on add). Used only to address a row; never shown. */
	id: string;
	/** Human name as it appears on the settings row (e.g. "Standaardtarief"). */
	label: string;
	kind: VatRateKind;
	/** Percentage, integer. `0` for the zero rate. */
	rate: number;
	/** Preselected on new quote / catalog lines. Exactly one active rate is the default. */
	isDefault: boolean;
	/** Inactive rates are kept but hidden from the quote / catalog dropdowns. */
	active: boolean;
}

export interface OrgVatConfig {
	/** The org's rate options, in display order. */
	rates: VatRateOption[];
	reverseChargeEnabled: boolean;
	/** Label for the reverse-charge option (NL: "BTW verlegd"; renameable for other locales). */
	reverseChargeLabel: string;
}

export const VAT_RATE_KINDS: readonly VatRateKind[] = ['standard', 'reduced', 'zero'];

export interface VatRateKindMeta {
	/** Default name suggested for a rate of this kind. */
	label: string;
	hint: string;
	suggestedRate: number;
}

/** Copy + suggested rate per kind — shared by the settings rows and the add/edit modal. */
export const VAT_KIND_META: Record<VatRateKind, VatRateKindMeta> = {
	standard: {
		label: 'Standaardtarief',
		hint: 'Het meest gebruikte tarief — het hoge tarief.',
		suggestedRate: 21
	},
	reduced: {
		label: 'Verlaagd tarief',
		hint: 'Voor goederen en diensten met een lager tarief.',
		suggestedRate: 9
	},
	zero: {
		label: 'Nultarief',
		hint: 'Vrijgesteld of belast tegen 0%.',
		suggestedRate: 0
	}
};

/** Fallback when an org hasn't configured VAT yet (empty `vatRates`). */
export const DEFAULT_NL_VAT_CONFIG: OrgVatConfig = {
	rates: [
		{ id: 'vat_standard', label: 'Standaardtarief', kind: 'standard', rate: 21, isDefault: true, active: true },
		{ id: 'vat_reduced', label: 'Verlaagd tarief', kind: 'reduced', rate: 9, isDefault: false, active: true },
		{ id: 'vat_zero', label: 'Nultarief', kind: 'zero', rate: 0, isDefault: false, active: true }
	],
	reverseChargeEnabled: true,
	reverseChargeLabel: 'BTW verlegd'
};

export const VAT_RATE_MIN = 0;
export const VAT_RATE_MAX = 100;
/** Upper bound offered in the add/edit modal (well above any real-world VAT rate). */
export const VAT_RATE_UI_MAX = 30;
export const VAT_RATES_MAX_COUNT = 12;
export const VAT_RATE_LABEL_MAX_LENGTH = 40;
export const VAT_REVERSE_CHARGE_LABEL_MAX_LENGTH = 60;

/** Stable option id for the reverse-charge ("verlegd") choice on the quote-line VAT select. */
export const VAT_REVERSE_CHARGE_OPTION_ID = 'reverse';

export interface VatSelectOption {
	id: string;
	label: string;
}

/** Format a numeric rate as a percentage label, NL-style: 21 → "21%", 5.5 → "5,5%". */
export function formatVatRateLabel(rate: number): string {
	return `${String(rate).replace('.', ',')}%`;
}

/** The active rate options, in display order. */
export function getActiveVatRates(config: OrgVatConfig): VatRateOption[] {
	return config.rates.filter(rate => rate.active);
}

/** The preselected rate value for new lines: the active default, else the first active rate, else 0. */
export function getDefaultVatRate(config: OrgVatConfig): number {
	const active = getActiveVatRates(config);
	const preferred = active.find(rate => rate.isDefault) ?? active[0];
	return preferred?.rate ?? 0;
}

/**
 * Guarantee exactly one active rate is marked default. The first active rate already flagged
 * default wins; if none is flagged, the first active rate becomes the default. Inactive rates and
 * any surplus active defaults are cleared, so the result always has at most one default (zero only
 * when there are no active rates at all).
 */
export function vatEnsureDefault(rates: VatRateOption[]): VatRateOption[] {
	// Select by index, not id — a hostile / buggy payload with duplicate ids must not flag two rows.
	const flagged = rates.findIndex(rate => rate.active && rate.isDefault);
	const chosenIndex = flagged === -1 ? rates.findIndex(rate => rate.active) : flagged;
	return rates.map((rate, index) => ({ ...rate, isDefault: rate.active && index === chosenIndex }));
}

/** Stable quote/catalog option id for a numeric rate (the rate itself as a string). */
function rateOptionId(rate: number): string {
	return String(rate);
}

/** Active rates deduped by percentage (quote/catalog lines snapshot the number, not the option id). */
function activeRateSelectOptions(config: OrgVatConfig): VatSelectOption[] {
	const seen = new Set<number>();
	const options: VatSelectOption[] = [];
	for (const rate of getActiveVatRates(config)) {
		if (seen.has(rate.rate)) {
			continue;
		}
		seen.add(rate.rate);
		options.push({ id: rateOptionId(rate.rate), label: formatVatRateLabel(rate.rate) });
	}
	return options;
}

/**
 * Quote-line VAT options: each active rate, plus a reverse-charge option when enabled. The
 * reverse-charge option's id is {@link VAT_REVERSE_CHARGE_OPTION_ID}; a numeric id maps to that
 * `vatRate` with `vatReverseCharged: false`.
 */
export function buildQuoteVatOptions(config: OrgVatConfig): VatSelectOption[] {
	const options = activeRateSelectOptions(config);
	if (config.reverseChargeEnabled) {
		options.push({ id: VAT_REVERSE_CHARGE_OPTION_ID, label: config.reverseChargeLabel });
	}
	return options;
}

/** Catalog-item BTW options: active rates only (catalog items have no reverse-charge concept). */
export function buildCatalogVatOptions(config: OrgVatConfig): VatSelectOption[] {
	return activeRateSelectOptions(config);
}

/**
 * Synthetic options for `usedRates` a saved line / catalog item still references but that are no
 * longer in the active config (removed or deactivated). Keeps a select from falling through to the
 * untranslated placeholder — de-duped, and never shadowing a rate that's already active.
 */
function orphanRateOptions(config: OrgVatConfig, usedRates: number[]): VatRateOption[] {
	const active = new Set(getActiveVatRates(config).map(rate => rate.rate));
	const seen = new Set<number>();
	const orphans: VatRateOption[] = [];
	for (const rate of usedRates) {
		if (active.has(rate) || seen.has(rate)) {
			continue;
		}
		seen.add(rate);
		orphans.push({ id: `orphan-${rate}`, label: formatVatRateLabel(rate), kind: 'standard', rate, isDefault: false, active: true });
	}
	return orphans;
}

/** {@link buildQuoteVatOptions} plus any `usedRates` a saved line references that left the config. */
export function buildQuoteVatOptionsWithUsed(config: OrgVatConfig, usedRates: number[]): VatSelectOption[] {
	const orphans = orphanRateOptions(config, usedRates);
	return buildQuoteVatOptions(orphans.length > 0 ? { ...config, rates: [...config.rates, ...orphans] } : config);
}

/** {@link buildCatalogVatOptions} plus any `usedRates` a saved catalog item references that left the config. */
export function buildCatalogVatOptionsWithUsed(config: OrgVatConfig, usedRates: number[]): VatSelectOption[] {
	const orphans = orphanRateOptions(config, usedRates);
	return buildCatalogVatOptions(orphans.length > 0 ? { ...config, rates: [...config.rates, ...orphans] } : config);
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
