import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

export interface QuotePdfRow {
	id: string;
	organizationId: string;
	opportunityId: string;
	quoteDraftId: string | null;
	filename: string;
	quoteNumber: string | null;
	contentType: string;
	sizeBytes: number;
	totalCents: number | null;
	storageKey: string;
	storageDriver: string;
	createdAt: Date;
}

export interface CreateQuotePdfInput {
	organizationId: string;
	opportunityId: string;
	quoteDraftId: string | null;
	filename: string;
	quoteNumber: string | null;
	contentType: string;
	sizeBytes: number;
	totalCents: number | null;
	storageKey: string;
	storageDriver: string;
}

@Injectable()
export class QuotePdfsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async create(input: CreateQuotePdfInput): Promise<QuotePdfRow> {
		return this.prisma.quotePdf.create({ data: input });
	}

	/** All generated PDF versions for an opportunity (newest-first), tenant-scoped. */
	async listForOpportunity(organizationId: string, opportunityId: string): Promise<QuotePdfRow[]> {
		return this.prisma.quotePdf.findMany({
			where: { organizationId, opportunityId },
			orderBy: { createdAt: 'desc' }
		});
	}

	/** One PDF version scoped to the org. Null if missing / other tenant. */
	async findForOrganization(organizationId: string, quotePdfId: string): Promise<QuotePdfRow | null> {
		return this.prisma.quotePdf.findFirst({ where: { id: quotePdfId, organizationId } });
	}
}
