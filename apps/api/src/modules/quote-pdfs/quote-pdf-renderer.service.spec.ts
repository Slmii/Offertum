import {
	QuotePdfRendererService,
	calculateLineTotals,
	calculateTotals
} from '@/modules/quote-pdfs/quote-pdf-renderer.service';
import type { QuotePdfLineItem, QuotePdfRenderInput } from '@/modules/quote-pdfs/quote-pdf.types';
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-pdf/renderer', () => ({
	Document: 'Document',
	Page: 'Page',
	Image: 'Image',
	Text: 'Text',
	View: 'View',
	renderToBuffer: jest.fn(async () => Buffer.from('%PDF-1.7\nmock pdf body\n%%EOF'))
}));

describe('QuotePdfRendererService', () => {
	it('renders a valid PDF for business details and line items', async () => {
		const service = new QuotePdfRendererService();
		const input: QuotePdfRenderInput = {
			quoteNumber: 'OFF-2026-0001',
			issueDate: new Date('2026-05-28T10:00:00.000Z'),
			validUntil: new Date('2026-06-27T10:00:00.000Z'),
			customerName: 'Van Dijk Bouw',
			customerEmail: 'info@vandijkbouw.example',
			customerAddress: 'Keizersgracht 10\n1015 CN Amsterdam',
			businessDetails: {
				name: 'Offertum Demo BV',
				companyRegistrationNumber: 'KvK 12345678',
				companyVatNumber: 'NL123456789B01',
				companyAddress: 'Singel 1\n1012 VC Amsterdam',
				companyPhone: '+31 20 123 4567',
				companyWebsite: 'https://offertum.nl',
				companyFooter: 'IBAN NL00 TEST 0123 4567 89',
				defaultPaymentTermsDays: 14,
				hasLogo: false,
				hasLetterhead: false
			},
			logoDataUri: 'data:image/png;base64,bG9nbw==',
			letterheadDataUri: 'data:image/png;base64,bGV0dGVyaGVhZA==',
			lineItems: [
				{
					description: 'Badkamerinspectie en advies',
					quantity: 2,
					unit: 'hour',
					unitPriceEur: '85.00',
					vatRate: 21,
					vatReverseCharged: false,
					isAdjustment: false
				},
				{
					description: 'Voorrijkosten Amsterdam',
					quantity: 1,
					unit: 'flat_fee',
					unitPriceEur: '35.00',
					vatRate: 21,
					vatReverseCharged: false,
					isAdjustment: true
				}
			]
		};

		const pdf = await service.render(input);

		expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF');
		expect(pdf.toString('latin1')).toContain('%%EOF');
		expect(pdf.length).toBeGreaterThan(20);
	});
});

const line = (overrides: Partial<QuotePdfLineItem> = {}): QuotePdfLineItem => ({
	description: 'Werk',
	unit: 'hour',
	unitPriceEur: '85.00',
	quantity: 1,
	vatRate: 21,
	vatReverseCharged: false,
	isAdjustment: false,
	...overrides
});

describe('calculateLineTotals', () => {
	it('computes net = price × quantity and VAT off the net (in cents)', () => {
		expect(calculateLineTotals(line({ unitPriceEur: '85.00', quantity: 2, vatRate: 21 }))).toEqual({
			netCents: 17000,
			vatCents: 3570,
			grossCents: 20570
		});
	});

	it('rounds VAT to the nearest cent per line', () => {
		// 35.00 × 1 = 3500 net; 9% = 315.0 → 315
		expect(calculateLineTotals(line({ unitPriceEur: '35.00', quantity: 1, vatRate: 9 }))).toEqual({
			netCents: 3500,
			vatCents: 315,
			grossCents: 3815
		});
		// 0.10 × 3 = 30 net; 21% = 6.3 → rounds to 6
		expect(calculateLineTotals(line({ unitPriceEur: '0.10', quantity: 3, vatRate: 21 }))).toEqual({
			netCents: 30,
			vatCents: 6,
			grossCents: 36
		});
	});

	it('handles a 0% VAT line (exempt)', () => {
		expect(calculateLineTotals(line({ unitPriceEur: '100.00', quantity: 1, vatRate: 0 }))).toEqual({
			netCents: 10000,
			vatCents: 0,
			grossCents: 10000
		});
	});

	it('charges €0 VAT on a reverse-charge line even at a non-zero rate', () => {
		expect(
			calculateLineTotals(line({ unitPriceEur: '100.00', quantity: 1, vatRate: 21, vatReverseCharged: true }))
		).toEqual({
			netCents: 10000,
			vatCents: 0,
			grossCents: 10000
		});
	});

	it('handles fractional quantities (e.g. 1,5 m²)', () => {
		// 55.00 × 1.5 = 82.50 net; 21% = 17.325 → 1733
		expect(
			calculateLineTotals(line({ unitPriceEur: '55.00', quantity: 1.5, unit: 'square_meter', vatRate: 21 }))
		).toEqual({ netCents: 8250, vatCents: 1733, grossCents: 9983 });
	});
});

describe('calculateTotals', () => {
	it('aggregates mixed-VAT lines with per-line rounding', () => {
		// 2×€85 @21% + 1×€35 @9%
		expect(
			calculateTotals([
				line({ unitPriceEur: '85.00', quantity: 2, vatRate: 21 }),
				line({ unitPriceEur: '35.00', quantity: 1, vatRate: 9 })
			])
		).toEqual({ netCents: 20500, vatCents: 3885, grossCents: 24385 });
	});

	it('returns zeroes for an empty line-item list', () => {
		expect(calculateTotals([])).toEqual({ netCents: 0, vatCents: 0, grossCents: 0 });
	});
});
