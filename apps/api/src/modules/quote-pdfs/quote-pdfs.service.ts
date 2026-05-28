import { ATTACHMENT_STORAGE, type AttachmentStorage } from '@/lib/storage/attachment-storage.interface';
import { PreviewQuotePdfDto } from '@/modules/quote-pdfs/dto/preview-quote-pdf.dto';
import { QuotePdfRendererService } from '@/modules/quote-pdfs/quote-pdf-renderer.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Inject, Injectable } from '@nestjs/common';

const DEFAULT_QUOTE_VALID_DAYS = 30;

@Injectable()
export class QuotePdfsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly renderer: QuotePdfRendererService,
		@Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage
	) {}

	async preview(organizationId: string, input: PreviewQuotePdfDto): Promise<Buffer> {
		const businessDetails = await this.prisma.organization.findUniqueOrThrow({
			where: { id: organizationId },
			select: {
				name: true,
				companyRegistrationNumber: true,
				companyVatNumber: true,
				companyAddress: true,
				companyPhone: true,
				companyWebsite: true,
				companyFooter: true,
				defaultPaymentTermsDays: true,
				logoStorageKey: true,
				letterheadStorageKey: true
			}
		});
		const issueDate = new Date();
		const [logoDataUri, letterheadDataUri] = await Promise.all([
			this.readAssetDataUri(businessDetails.logoStorageKey),
			this.readAssetDataUri(businessDetails.letterheadStorageKey)
		]);

		return this.renderer.render({
			quoteNumber: normalizeOptionalText(input.quoteNumber) ?? buildPreviewQuoteNumber(issueDate),
			issueDate,
			validUntil: addDays(issueDate, DEFAULT_QUOTE_VALID_DAYS),
			customerName: input.customerName.trim(),
			customerEmail: normalizeOptionalText(input.customerEmail),
			customerAddress: normalizeOptionalText(input.customerAddress),
			businessDetails: {
				name: businessDetails.name,
				companyRegistrationNumber: businessDetails.companyRegistrationNumber,
				companyVatNumber: businessDetails.companyVatNumber,
				companyAddress: businessDetails.companyAddress,
				companyPhone: businessDetails.companyPhone,
				companyWebsite: businessDetails.companyWebsite,
				companyFooter: businessDetails.companyFooter,
				defaultPaymentTermsDays: businessDetails.defaultPaymentTermsDays,
				hasLogo: businessDetails.logoStorageKey !== null,
				hasLetterhead: businessDetails.letterheadStorageKey !== null
			},
			lineItems: input.lineItems.map(item => ({
				description: item.description.trim(),
				quantity: item.quantity,
				unit: item.unit,
				unitPriceEur: item.unitPriceEur,
				vatRate: item.vatRate
			})),
			logoDataUri,
			letterheadDataUri
		});
	}

	private async readAssetDataUri(storageKey: string | null): Promise<string | null> {
		if (!storageKey) {
			return null;
		}
		const asset = await this.storage.get(storageKey);
		return `data:${asset.contentType};base64,${asset.data.toString('base64')}`;
	}
}

function normalizeOptionalText(value: string | null | undefined): string | null {
	if (value === null || value === undefined) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function addDays(value: Date, days: number): Date {
	const next = new Date(value);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

function buildPreviewQuoteNumber(value: Date): string {
	return `PREVIEW-${value.toISOString().slice(0, 10).replaceAll('-', '')}`;
}
