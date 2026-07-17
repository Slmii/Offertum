import { QUOTE_PDF_NOT_FOUND } from '@/lib/errors';
import { ATTACHMENT_STORAGE, type AttachmentStorage } from '@/lib/storage/attachment-storage.interface';
import { PreviewQuotePdfDto } from '@/modules/quote-pdfs/dto/preview-quote-pdf.dto';
import { QuotePdfRendererService } from '@/modules/quote-pdfs/quote-pdf-renderer.service';
import type { QuotePdfLineItem } from '@/modules/quote-pdfs/quote-pdf.types';
import { type QuotePdfRow, QuotePdfsRepository } from '@/modules/quote-pdfs/quote-pdfs.repository';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { formatQuoteNumber, type QuotePdf } from '@offertum/shared';
import { randomUUID } from 'node:crypto';

/** Inputs that vary per quote; business details + branding are loaded from the org. */
export interface RenderQuoteInput {
	customerName: string;
	customerEmail: string | null;
	customerAddress: string | null;
	lineItems: QuotePdfLineItem[];
	quoteNumber: string | null;
	// Issue date printed on the PDF. The real generate path passes the QuoteDraft's createdAt;
	// omitted for ad-hoc previews, which fall back to the current time.
	issueDate?: Date;
	// "Geldig tot" date. The real generate path passes the QuoteDraft's stored validUntil so the
	// printed validity matches the calendar `expiry` event + opp detail exactly. Omitted for
	// previews (and legacy drafts with no stored value) → falls back to issueDate + quoteValidityDays.
	validUntil?: Date;
}

export interface RenderedQuotePdf {
	buffer: Buffer;
	/** `Offerte-<org>-<customer>-<YYYYMMDD>.pdf`. */
	filename: string;
}

@Injectable()
export class QuotePdfsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly renderer: QuotePdfRendererService,
		private readonly repository: QuotePdfsRepository,
		@Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage
	) {}

	/** Persist a rendered PDF as a version in the opportunity's history (W10.4). */
	async storeVersion(
		organizationId: string,
		opportunityId: string,
		quoteDraftId: string | null,
		pdf: { buffer: Buffer; filename: string },
		totalCents: number | null,
		quoteNumber: string | null
	): Promise<QuotePdf> {
		const { storageKey } = await this.storage.put({
			storageKey: `quote-pdfs/${opportunityId}/${randomUUID()}-${pdf.filename}`,
			data: pdf.buffer,
			contentType: 'application/pdf'
		});
		const row = await this.repository.create({
			organizationId,
			opportunityId,
			quoteDraftId,
			filename: pdf.filename,
			quoteNumber,
			contentType: 'application/pdf',
			sizeBytes: pdf.buffer.length,
			totalCents,
			storageKey,
			storageDriver: this.storage.driver
		});
		return toQuotePdfWire(row);
	}

	/** PDF version history for an opportunity (newest-first). */
	async listForOpportunity(organizationId: string, opportunityId: string): Promise<QuotePdf[]> {
		const rows = await this.repository.listForOpportunity(organizationId, opportunityId);
		return rows.map(toQuotePdfWire);
	}

	/** Load a version's binary for download (tenant-scoped). */
	async getDownload(
		organizationId: string,
		quotePdfId: string
	): Promise<{ filename: string; contentType: string; data: Buffer }> {
		const row = await this.repository.findForOrganization(organizationId, quotePdfId);
		if (!row) {
			throw new NotFoundException(QUOTE_PDF_NOT_FOUND);
		}
		const asset = await this.storage.get(row.storageKey);
		return { filename: row.filename, contentType: row.contentType, data: asset.data };
	}

	async preview(organizationId: string, input: PreviewQuotePdfDto): Promise<Buffer> {
		const { buffer } = await this.renderQuote(organizationId, {
			customerName: input.customerName.trim(),
			customerEmail: normalizeOptionalText(input.customerEmail),
			customerAddress: normalizeOptionalText(input.customerAddress),
			quoteNumber: normalizeOptionalText(input.quoteNumber),
			// Preview DTO predates reverse charge; sample lines are standard-rated.
			lineItems: input.lineItems.map(item => ({
				description: item.description.trim(),
				quantity: item.quantity,
				unit: item.unit,
				unitPriceEur: item.unitPriceEur,
				vatRate: item.vatRate,
				vatReverseCharged: false
			}))
		});
		return buffer;
	}

	/** Render a quote PDF for the given inputs + the org's branding/business details,
	 * returning the buffer and a well-named filename (W10.4). */
	async renderQuote(organizationId: string, input: RenderQuoteInput): Promise<RenderedQuotePdf> {
		const org = await this.prisma.organization.findUniqueOrThrow({
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
				quoteValidityDays: true,
				logoStorageKey: true,
				letterheadStorageKey: true
			}
		});
		const issueDate = input.issueDate ?? new Date();
		const validUntil = input.validUntil ?? addDays(issueDate, org.quoteValidityDays);
		const [logoDataUri, letterheadDataUri] = await Promise.all([
			this.readAssetDataUri(org.logoStorageKey),
			this.readAssetDataUri(org.letterheadStorageKey)
		]);

		const buffer = await this.renderer.render({
			quoteNumber: input.quoteNumber ?? buildQuoteNumber(issueDate),
			issueDate,
			validUntil,
			customerName: input.customerName,
			customerEmail: input.customerEmail,
			customerAddress: input.customerAddress,
			businessDetails: {
				name: org.name,
				companyRegistrationNumber: org.companyRegistrationNumber,
				companyVatNumber: org.companyVatNumber,
				companyAddress: org.companyAddress,
				companyPhone: org.companyPhone,
				companyWebsite: org.companyWebsite,
				companyFooter: org.companyFooter,
				defaultPaymentTermsDays: org.defaultPaymentTermsDays,
				hasLogo: org.logoStorageKey !== null,
				hasLetterhead: org.letterheadStorageKey !== null
			},
			lineItems: input.lineItems,
			logoDataUri,
			letterheadDataUri
		});

		return { buffer, filename: buildQuotePdfFilename(org.name, input.customerName, issueDate) };
	}

	private async readAssetDataUri(storageKey: string | null): Promise<string | null> {
		if (!storageKey) {
			return null;
		}
		const asset = await this.storage.get(storageKey);
		return `data:${asset.contentType};base64,${asset.data.toString('base64')}`;
	}
}

function toQuotePdfWire(row: QuotePdfRow): QuotePdf {
	return {
		id: row.id,
		opportunityId: row.opportunityId,
		quoteDraftId: row.quoteDraftId,
		filename: row.filename,
		sizeBytes: row.sizeBytes,
		totalCents: row.totalCents,
		createdAt: row.createdAt.toISOString()
	};
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

function isoDateCompact(value: Date): string {
	return value.toISOString().slice(0, 10).replaceAll('-', '');
}

// Preview / sample fallback only. Real quotes get an org-unique number via the counter in
// QuoteDraftsService; here we just render a representative sample so the preview looks realistic.
function buildQuoteNumber(value: Date): string {
	return formatQuoteNumber(value.getUTCFullYear(), 1);
}

/** `Offerte-<org>-<customer>-<YYYYMMDD>.pdf`, with names slugged to safe characters. */
function buildQuotePdfFilename(orgName: string, customerName: string, issueDate: Date): string {
	return `Offerte-${slugForFilename(orgName)}-${slugForFilename(customerName)}-${isoDateCompact(issueDate)}.pdf`;
}

function slugForFilename(value: string): string {
	const slug = value
		.normalize('NFKD')
		.replace(/[^\p{L}\p{N}]/gu, '')
		.slice(0, 40);
	return slug.length > 0 ? slug : 'Onbekend';
}
