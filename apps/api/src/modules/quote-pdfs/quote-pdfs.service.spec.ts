import { QuotePdfsService } from '@/modules/quote-pdfs/quote-pdfs.service';
import type { QuotePdfRendererService } from '@/modules/quote-pdfs/quote-pdf-renderer.service';
import type { PrismaService } from '@/modules/prisma/prisma.service';
import type { AttachmentStorage } from '@/lib/storage/attachment-storage.interface';

describe('QuotePdfsService', () => {
	it('renders a preview using the active organization business details', async () => {
		const prisma = {
			organization: {
				findUniqueOrThrow: jest.fn(async () => ({
					name: 'Offertum Demo BV',
					companyRegistrationNumber: 'KvK 12345678',
					companyVatNumber: 'NL123456789B01',
					companyAddress: 'Singel 1\n1012 VC Amsterdam',
					companyPhone: '+31 20 123 4567',
					companyWebsite: 'https://offertum.nl',
					companyFooter: 'IBAN NL00 TEST 0123 4567 89',
					defaultPaymentTermsDays: 14,
					logoStorageKey: 'organizations/org-1/business-assets/logo',
					letterheadStorageKey: 'organizations/org-1/business-assets/letterhead'
				}))
			}
		} as unknown as PrismaService;
		const renderer = {
			render: jest.fn(async () => Buffer.from('%PDF-1.7\npreview\n%%EOF'))
		} as unknown as QuotePdfRendererService;
		const storage = {
			get: jest.fn(async (storageKey: string) => ({
				data: Buffer.from(storageKey.includes('logo') ? 'logo' : 'letterhead'),
				contentType: 'image/png'
			}))
		} as unknown as AttachmentStorage;
		const service = new QuotePdfsService(prisma, renderer, storage);

		const pdf = await service.preview('org-1', {
			customerName: 'Van Dijk Bouw',
			customerEmail: 'info@vandijkbouw.example',
			customerAddress: 'Keizersgracht 10\n1015 CN Amsterdam',
			quoteNumber: 'OFF-2026-0001',
			lineItems: [
				{
					description: 'Badkamerinspectie en advies',
					quantity: 2,
					unit: 'hour',
					unitPriceEur: '85.00',
					vatRate: 21
				}
			]
		});

		expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF');
		expect(prisma.organization.findUniqueOrThrow).toHaveBeenCalledWith({
			where: { id: 'org-1' },
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
		expect(renderer.render).toHaveBeenCalledWith(
			expect.objectContaining({
				quoteNumber: 'OFF-2026-0001',
				customerName: 'Van Dijk Bouw',
				businessDetails: expect.objectContaining({
					name: 'Offertum Demo BV',
					companyPhone: '+31 20 123 4567',
					companyWebsite: 'https://offertum.nl',
					hasLogo: true,
					hasLetterhead: true
				}),
				logoDataUri: 'data:image/png;base64,bG9nbw==',
				letterheadDataUri: 'data:image/png;base64,bGV0dGVyaGVhZA=='
			})
		);
	});
});
