import type { QuotePdf } from '@offertum/shared';

export class QuotePdfResponseDto implements QuotePdf {
	id!: string;
	opportunityId!: string;
	quoteDraftId!: string | null;
	filename!: string;
	quoteNumber!: string | null;
	sizeBytes!: number;
	totalCents!: number | null;
	validUntil!: string | null;
	createdAt!: string;
}
