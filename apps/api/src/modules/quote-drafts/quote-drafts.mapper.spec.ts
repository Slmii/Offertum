import { QuoteDraftStatus, QuoteLineSource } from '@/generated/prisma/enums';
import type { QuoteDraftWithLines } from '@/modules/quote-drafts/quote-drafts.repository';
import { toQuoteDraftWire } from '@/modules/quote-drafts/quote-drafts.mapper';
import { describe, expect, it } from '@jest/globals';

/**
 * Pure mapping guardrail: Decimal columns must become precision-preserving strings,
 * Prisma enums must become the lowercase wire values, and dates must be ISO strings.
 * A wrong number on a quote is a real-world liability, so the price/quantity string
 * conversion is the load-bearing assertion here.
 */

// `Decimal` exposes `.toString()` + `.toNumber()`; fake both so the test needs no DB / Prisma runtime.
function decimal(value: string): never {
	return { toString: () => value, toNumber: () => Number(value) } as never;
}

function row(overrides: Partial<QuoteDraftWithLines> = {}): QuoteDraftWithLines {
	return {
		id: 'draft-1',
		organizationId: 'org-1',
		opportunityId: 'opp-1',
		status: QuoteDraftStatus.DRAFT,
		generationContext: {},
		aiCallId: null,
		sentAt: null,
		createdAt: new Date('2026-05-28T10:00:00.000Z'),
		updatedAt: new Date('2026-05-28T10:05:00.000Z'),
		lineItems: [
			{
				id: 'line-1',
				quoteDraftId: 'draft-1',
				position: 0,
				description: 'Arbeid loodgieter',
				unit: 'hour',
				quantity: decimal('4.00'),
				unitPriceEur: decimal('85.00'),
				vatRate: decimal('21'),
				vatReverseCharged: false,
				source: QuoteLineSource.CATALOG_MATCH,
				catalogItemId: 'cat-1',
				appliedRuleId: null,
				ruleEffectType: null,
				note: null,
				wasEditedByUser: false,
				createdAt: new Date('2026-05-28T10:00:00.000Z'),
				updatedAt: new Date('2026-05-28T10:00:00.000Z')
			}
		],
		...overrides
	} as QuoteDraftWithLines;
}

describe('toQuoteDraftWire', () => {
	it('maps status, dates, and line decimals to wire format', () => {
		const wire = toQuoteDraftWire(row());

		expect(wire).toMatchObject({
			id: 'draft-1',
			opportunityId: 'opp-1',
			status: 'draft',
			createdAt: '2026-05-28T10:00:00.000Z',
			updatedAt: '2026-05-28T10:05:00.000Z',
			sentAt: null
		});
		expect(wire.lineItems[0]).toMatchObject({
			position: 0,
			quantity: '4.00',
			unitPriceEur: '85.00',
			vatRate: 21,
			source: 'catalog_match',
			wasEditedByUser: false,
			catalogItemId: 'cat-1'
		});
	});

	it('keeps a null unit price (inferred line) null on the wire', () => {
		const wire = toQuoteDraftWire(
			row({
				lineItems: [
					{
						id: 'line-2',
						quoteDraftId: 'draft-1',
						position: 0,
						description: 'Speciaal materiaal',
						unit: 'piece',
						quantity: decimal('5.00'),
						unitPriceEur: null,
						vatRate: decimal('21'),
						vatReverseCharged: false,
						source: QuoteLineSource.INFERRED,
						catalogItemId: null,
						appliedRuleId: null,
						ruleEffectType: null,
						note: 'Stel een prijs in',
						wasEditedByUser: false,
						createdAt: new Date('2026-05-28T10:00:00.000Z'),
						updatedAt: new Date('2026-05-28T10:00:00.000Z')
					}
				]
			})
		);

		expect(wire.lineItems[0]).toMatchObject({
			unitPriceEur: null,
			source: 'inferred',
			note: 'Stel een prijs in'
		});
	});

	it('maps a sent draft status + timestamp', () => {
		const wire = toQuoteDraftWire(
			row({ status: QuoteDraftStatus.SENT, sentAt: new Date('2026-05-29T09:00:00.000Z') })
		);
		expect(wire.status).toBe('sent');
		expect(wire.sentAt).toBe('2026-05-29T09:00:00.000Z');
	});
});
