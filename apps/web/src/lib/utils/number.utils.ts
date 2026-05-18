/**
 * Locale-aware number + currency formatters. Use these everywhere instead of inline
 * `toLocaleString` / `toFixed` so the formatting rules stay in one place and the SSR
 * output matches the client output (calling `toLocaleString(undefined, …)` would pick
 * up Node's `en-US` on the server but the visitor's locale in the browser → hydration
 * mismatch, see CLAUDE.md "SSR-safe formatting").
 *
 * NL-first per [[project-launch-scope]]: thousand separator is `.` and decimal is `,`
 * (e.g., `1.234,56`). Currency symbol leads with a non-breaking space.
 */

const NL_NUMBER_FORMATTER = new Intl.NumberFormat('nl-NL');
const NL_DECIMAL_FORMATTER = new Intl.NumberFormat('nl-NL', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});

const NL_EUR_FORMATTER = new Intl.NumberFormat('nl-NL', {
	style: 'currency',
	currency: 'EUR',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});

const NL_USD_FORMATTER = new Intl.NumberFormat('nl-NL', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});

const NL_USD_PRECISE_FORMATTER = new Intl.NumberFormat('nl-NL', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 4,
	maximumFractionDigits: 6
});

const NL_PERCENT_FORMATTER = new Intl.NumberFormat('nl-NL', {
	style: 'percent',
	minimumFractionDigits: 1,
	maximumFractionDigits: 1
});

/** `1234567` → `"1.234.567"`. Use for any human-readable integer (counts, tokens, etc.). */
export const toReadableNumber = (value: number): string => NL_NUMBER_FORMATTER.format(value);

/** `1234.56` → `"1.234,56"`. For non-currency decimals. */
export const toReadableDecimal = (value: number): string => NL_DECIMAL_FORMATTER.format(value);

/** `1234.56` → `"€ 1.234,56"`. For everything user-facing where the currency is EUR. */
export const toReadableEuro = (value: number): string => NL_EUR_FORMATTER.format(value);

/** `1234.56` → `"US$ 1.234,56"`. Standard 2-decimal USD. */
export const toReadableUsd = (value: number): string => NL_USD_FORMATTER.format(value);

/**
 * `0.000423` → `"US$ 0,000423"`. Use when the value can be tiny (e.g. per-AI-call
 * cost) and 2 decimals would round it to zero. Caps at 6 decimals so the rendered
 * width stays bounded.
 */
export const toReadableUsdPrecise = (value: number): string => NL_USD_PRECISE_FORMATTER.format(value);

/**
 * `0.977` → `"97,7%"`. Pass a unit ratio (0..1); the formatter applies the ×100 itself.
 * One decimal so precision metrics on the admin dashboard read as "97,7%" not "98%" or
 * "97,72%". Pass `null` or `NaN` and you get `"—"` so empty states render cleanly.
 */
export const toReadablePercent = (value: number | null | undefined): string => {
	if (value === null || value === undefined || Number.isNaN(value)) {
		return '—';
	}
	return NL_PERCENT_FORMATTER.format(value);
};
