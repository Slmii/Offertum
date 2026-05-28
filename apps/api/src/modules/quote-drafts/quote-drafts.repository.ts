import type { Prisma } from '@/generated/prisma/client';
import type { QuoteLineSource as PrismaQuoteLineSource } from '@/generated/prisma/enums';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

/** Full draft row with its line items, ordered by `position`. */
export type QuoteDraftWithLines = Prisma.QuoteDraftGetPayload<{ include: { lineItems: true } }>;

export interface CreateQuoteLineRepoInput {
	position: number;
	description: string;
	unit: string;
	quantity: number | string;
	unitPriceEur: string | null;
	vatRate: number;
	source: PrismaQuoteLineSource;
	catalogItemId: string | null;
	appliedRuleId: string | null;
	note: string | null;
}

export interface CreateQuoteDraftRepoInput {
	organizationId: string;
	opportunityId: string;
	generationContext: Prisma.InputJsonValue;
	aiCallId: string | null;
	lineItems: CreateQuoteLineRepoInput[];
}

@Injectable()
export class QuoteDraftsRepository {
	constructor(private readonly prisma: PrismaService) {}

	/** Persist a draft + all its lines atomically (single nested create). */
	async create(input: CreateQuoteDraftRepoInput): Promise<QuoteDraftWithLines> {
		return this.prisma.quoteDraft.create({
			data: {
				organizationId: input.organizationId,
				opportunityId: input.opportunityId,
				generationContext: input.generationContext,
				aiCallId: input.aiCallId,
				lineItems: {
					create: input.lineItems.map(line => ({
						position: line.position,
						description: line.description,
						unit: line.unit,
						quantity: line.quantity,
						unitPriceEur: line.unitPriceEur,
						vatRate: line.vatRate,
						source: line.source,
						catalogItemId: line.catalogItemId,
						appliedRuleId: line.appliedRuleId,
						note: line.note
					}))
				}
			},
			include: { lineItems: { orderBy: { position: 'asc' } } }
		});
	}

	/** All drafts for an opportunity (newest-first), tenant-scoped, lines ordered. */
	async listForOpportunity(organizationId: string, opportunityId: string): Promise<QuoteDraftWithLines[]> {
		return this.prisma.quoteDraft.findMany({
			where: { organizationId, opportunityId },
			orderBy: { createdAt: 'desc' },
			include: { lineItems: { orderBy: { position: 'asc' } } }
		});
	}
}
