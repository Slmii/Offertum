// Shared currency format for notification emails (NL locale, whole euros).
const eurosFormatter = new Intl.NumberFormat('nl-NL', {
	style: 'currency',
	currency: 'EUR',
	maximumFractionDigits: 0
});

export function formatEmailEuros(value: number): string {
	return eurosFormatter.format(value);
}
