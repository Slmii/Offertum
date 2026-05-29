import type { QuotePdf } from '@offertum/shared';

export class QuotePdfResponseDto implements QuotePdf {
	id!: string;
	opportunityId!: string;
	quoteDraftId!: string | null;
	filename!: string;
	sizeBytes!: number;
	createdAt!: string;
}
