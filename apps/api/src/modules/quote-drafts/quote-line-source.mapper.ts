import { QuoteLineSource as PrismaQuoteLineSource } from '@/generated/prisma/enums';
import type { QuoteLineSource as WireQuoteLineSource } from '@offertum/shared';

export const QUOTE_LINE_SOURCE_TO_WIRE: Record<PrismaQuoteLineSource, WireQuoteLineSource> = {
	[PrismaQuoteLineSource.CATALOG_MATCH]: 'catalog_match',
	[PrismaQuoteLineSource.RULE_APPLIED]: 'rule_applied',
	[PrismaQuoteLineSource.INFERRED]: 'inferred'
};

export const QUOTE_LINE_SOURCE_FROM_WIRE: Record<WireQuoteLineSource, PrismaQuoteLineSource> = {
	catalog_match: PrismaQuoteLineSource.CATALOG_MATCH,
	rule_applied: PrismaQuoteLineSource.RULE_APPLIED,
	inferred: PrismaQuoteLineSource.INFERRED
};
