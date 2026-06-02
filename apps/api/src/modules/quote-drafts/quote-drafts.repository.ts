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
	vatReverseCharged: boolean;
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
	validUntil: Date;
	lineItems: CreateQuoteLineRepoInput[];
}

export interface AddQuoteLineRepoInput {
	description: string;
	unit: string;
	quantity: string;
	unitPriceEur: string | null;
	vatRate: number;
	vatReverseCharged: boolean;
}

export interface ReplaceQuoteLineRepoInput {
	description: string;
	unit: string;
	quantity: string;
	unitPriceEur: string | null;
	vatRate: number;
	vatReverseCharged: boolean;
	source: PrismaQuoteLineSource;
	catalogItemId: string | null;
	appliedRuleId: string | null;
	note: string | null;
	wasEditedByUser: boolean;
}

export interface UpdateQuoteLineRepoInput {
	description?: string;
	unit?: string;
	quantity?: string;
	unitPriceEur?: string | null;
	vatRate?: number;
	vatReverseCharged?: boolean;
	position?: number;
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
				validUntil: input.validUntil,
				lineItems: {
					create: input.lineItems.map(line => ({
						position: line.position,
						description: line.description,
						unit: line.unit,
						quantity: line.quantity,
						unitPriceEur: line.unitPriceEur,
						vatRate: line.vatRate,
						vatReverseCharged: line.vatReverseCharged,
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

	/** Load one draft (with lines) scoped to the org. Null if missing / other tenant. */
	async findForOrganization(organizationId: string, quoteDraftId: string): Promise<QuoteDraftWithLines | null> {
		return this.prisma.quoteDraft.findFirst({
			where: { id: quoteDraftId, organizationId },
			include: { lineItems: { orderBy: { position: 'asc' } } }
		});
	}

	/** Append an owner-authored line at the next position. Marked edited-by-user. */
	async addLine(quoteDraftId: string, input: AddQuoteLineRepoInput): Promise<void> {
		const max = await this.prisma.quoteLineItem.aggregate({
			where: { quoteDraftId },
			_max: { position: true }
		});
		await this.prisma.quoteLineItem.create({
			data: {
				quoteDraftId,
				position: (max._max.position ?? -1) + 1,
				description: input.description,
				unit: input.unit,
				quantity: input.quantity,
				unitPriceEur: input.unitPriceEur,
				vatRate: input.vatRate,
				vatReverseCharged: input.vatReverseCharged,
				// Owner-authored lines are 'inferred' (not catalog/rule sourced) + count as
				// edited for the year-2 AI-retention metric.
				source: 'INFERRED',
				wasEditedByUser: true
			}
		});
	}

	/** Patch a line and flip `wasEditedByUser`. Only supplied fields change. */
	async updateLine(lineItemId: string, patch: UpdateQuoteLineRepoInput): Promise<void> {
		await this.prisma.quoteLineItem.update({
			where: { id: lineItemId },
			data: {
				...(patch.description !== undefined ? { description: patch.description } : {}),
				...(patch.unit !== undefined ? { unit: patch.unit } : {}),
				...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
				...(patch.unitPriceEur !== undefined ? { unitPriceEur: patch.unitPriceEur } : {}),
				...(patch.vatRate !== undefined ? { vatRate: patch.vatRate } : {}),
				...(patch.vatReverseCharged !== undefined ? { vatReverseCharged: patch.vatReverseCharged } : {}),
				...(patch.position !== undefined ? { position: patch.position } : {}),
				wasEditedByUser: true
			}
		});
	}

	async deleteLine(lineItemId: string): Promise<void> {
		await this.prisma.quoteLineItem.delete({ where: { id: lineItemId } });
	}

	/** Replace every line on a draft atomically (regenerate-merge apply). Also bumps
	 * the draft's `updatedAt` so the "pricing changed since this quote" staleness check
	 * resets — the lines now reflect the current pricing. */
	async replaceLines(quoteDraftId: string, lines: ReadonlyArray<ReplaceQuoteLineRepoInput>): Promise<void> {
		await this.prisma.$transaction([
			this.prisma.quoteLineItem.deleteMany({ where: { quoteDraftId } }),
			this.prisma.quoteLineItem.createMany({
				data: lines.map((line, index) => ({
					quoteDraftId,
					position: index,
					description: line.description,
					unit: line.unit,
					quantity: line.quantity,
					unitPriceEur: line.unitPriceEur,
					vatRate: line.vatRate,
					vatReverseCharged: line.vatReverseCharged,
					source: line.source,
					catalogItemId: line.catalogItemId,
					appliedRuleId: line.appliedRuleId,
					note: line.note,
					wasEditedByUser: line.wasEditedByUser
				}))
			}),
			this.prisma.quoteDraft.update({ where: { id: quoteDraftId }, data: { updatedAt: new Date() } })
		]);
	}
}
