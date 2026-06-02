import type { QuotePdfLineItem, QuotePdfLineTotals, QuotePdfRenderInput, QuotePdfTotals } from './quote-pdf.types';
import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { CATALOG_ITEM_UNIT_LABELS_NL } from '@offertum/shared';
import { Injectable } from '@nestjs/common';
import { createElement, type ElementType, type ReactElement, type ReactNode } from 'react';

type ReactPdfRenderer = typeof import('@react-pdf/renderer');

const styles = {
	page: {
		padding: 40,
		fontFamily: 'Helvetica',
		fontSize: 10,
		color: '#17202a',
		backgroundColor: '#ffffff'
	},
	header: {
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'space-between',
		gap: 24,
		marginBottom: 30
	},
	letterhead: {
		position: 'absolute',
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		width: '100%',
		height: '100%',
		opacity: 0.12
	},
	brandBlock: {
		maxWidth: 280
	},
	logo: {
		width: 96,
		height: 48,
		objectFit: 'contain',
		marginBottom: 10
	},
	brandName: {
		fontSize: 20,
		fontWeight: 700,
		marginBottom: 8
	},
	muted: {
		color: '#5f6c7b'
	},
	quoteTitle: {
		fontSize: 24,
		fontWeight: 700,
		marginBottom: 8
	},
	metaBlock: {
		textAlign: 'right'
	},
	section: {
		marginBottom: 22
	},
	sectionTitle: {
		fontSize: 11,
		fontWeight: 700,
		textTransform: 'uppercase',
		color: '#334155',
		marginBottom: 8
	},
	twoColumns: {
		display: 'flex',
		flexDirection: 'row',
		gap: 28
	},
	column: {
		flexGrow: 1,
		flexBasis: 0
	},
	table: {
		borderWidth: 1,
		borderColor: '#d7dee8',
		borderStyle: 'solid'
	},
	tableRow: {
		display: 'flex',
		flexDirection: 'row',
		borderBottomWidth: 1,
		borderBottomColor: '#e5eaf0',
		borderBottomStyle: 'solid'
	},
	tableHeader: {
		backgroundColor: '#f3f6fa',
		fontWeight: 700
	},
	tableCell: {
		padding: 8
	},
	descriptionCell: {
		width: '42%'
	},
	quantityCell: {
		width: '12%',
		textAlign: 'right'
	},
	priceCell: {
		width: '16%',
		textAlign: 'right'
	},
	vatCell: {
		width: '12%',
		textAlign: 'right'
	},
	totalCell: {
		width: '18%',
		textAlign: 'right'
	},
	totals: {
		width: 220,
		marginLeft: 'auto',
		marginTop: 16
	},
	totalRow: {
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 5
	},
	grandTotal: {
		borderTopWidth: 1,
		borderTopColor: '#17202a',
		borderTopStyle: 'solid',
		paddingTop: 8,
		marginTop: 4,
		fontSize: 13,
		fontWeight: 700
	},
	footer: {
		position: 'absolute',
		left: 40,
		right: 40,
		bottom: 30,
		paddingTop: 10,
		borderTopWidth: 1,
		borderTopColor: '#d7dee8',
		borderTopStyle: 'solid',
		color: '#5f6c7b',
		fontSize: 9
	}
};

@Injectable()
export class QuotePdfRendererService {
	async render(input: QuotePdfRenderInput): Promise<Buffer> {
		const renderer = await import('@react-pdf/renderer');
		const document = this.document(input, renderer) as Parameters<typeof renderer.renderToBuffer>[0];
		return renderer.renderToBuffer(document);
	}

	private document(input: QuotePdfRenderInput, renderer: ReactPdfRenderer): ReactElement {
		const totals = calculateTotals(input.lineItems);
		return h(
			renderer.Document,
			{
				title: `Offerte ${input.quoteNumber}`,
				author: input.businessDetails.name,
				subject: `Offerte voor ${input.customerName}`,
				creator: 'Offertum',
				producer: 'Offertum'
			},
			h(
				renderer.Page,
				{ size: 'A4', style: styles.page },
				input.letterheadDataUri
					? h(renderer.Image, { src: input.letterheadDataUri, style: styles.letterhead, fixed: true })
					: null,
				this.renderHeader(input, renderer),
				this.renderParties(input, renderer),
				this.renderLineItems(input.lineItems, renderer),
				this.renderTotals(totals, renderer),
				this.renderPaymentTerms(input, renderer),
				this.renderFooter(input, renderer)
			)
		);
	}

	private renderHeader(input: QuotePdfRenderInput, renderer: ReactPdfRenderer): ReactElement {
		return h(
			renderer.View,
			{ style: styles.header },
			h(
				renderer.View,
				{ style: styles.brandBlock },
				input.logoDataUri ? h(renderer.Image, { src: input.logoDataUri, style: styles.logo }) : null,
				h(renderer.Text, { style: styles.brandName }, input.businessDetails.name),
				renderLines(input.businessDetails.companyAddress, styles.muted, renderer),
				renderOptionalText(input.businessDetails.companyRegistrationNumber, styles.muted, renderer),
				renderOptionalText(input.businessDetails.companyVatNumber, styles.muted, renderer),
				renderOptionalText(input.businessDetails.companyPhone, styles.muted, renderer),
				renderOptionalText(input.businessDetails.companyWebsite, styles.muted, renderer)
			),
			h(
				renderer.View,
				{ style: styles.metaBlock },
				h(renderer.Text, { style: styles.quoteTitle }, 'Offerte'),
				h(renderer.Text, null, input.quoteNumber),
				h(renderer.Text, { style: styles.muted }, `Datum: ${formatDate(input.issueDate)}`),
				h(renderer.Text, { style: styles.muted }, `Geldig tot: ${formatDate(input.validUntil)}`)
			)
		);
	}

	private renderParties(input: QuotePdfRenderInput, renderer: ReactPdfRenderer): ReactElement {
		return h(
			renderer.View,
			{ style: [styles.section, styles.twoColumns] },
			h(
				renderer.View,
				{ style: styles.column },
				h(renderer.Text, { style: styles.sectionTitle }, 'Van'),
				h(renderer.Text, null, input.businessDetails.name),
				renderLines(input.businessDetails.companyAddress, styles.muted, renderer),
				renderOptionalText(input.businessDetails.companyPhone, styles.muted, renderer),
				renderOptionalText(input.businessDetails.companyWebsite, styles.muted, renderer)
			),
			h(
				renderer.View,
				{ style: styles.column },
				h(renderer.Text, { style: styles.sectionTitle }, 'Voor'),
				h(renderer.Text, null, input.customerName),
				renderOptionalText(input.customerEmail, styles.muted, renderer),
				renderLines(input.customerAddress, styles.muted, renderer)
			)
		);
	}

	private renderLineItems(items: QuotePdfLineItem[], renderer: ReactPdfRenderer): ReactElement {
		return h(
			renderer.View,
			{ style: styles.section },
			h(renderer.Text, { style: styles.sectionTitle }, 'Werkzaamheden'),
			h(
				renderer.View,
				{ style: styles.table },
				h(
					renderer.View,
					{ style: [styles.tableRow, styles.tableHeader] },
					h(renderer.Text, { style: [styles.tableCell, styles.descriptionCell] }, 'Omschrijving'),
					h(renderer.Text, { style: [styles.tableCell, styles.quantityCell] }, 'Aantal'),
					h(renderer.Text, { style: [styles.tableCell, styles.priceCell] }, 'Prijs'),
					h(renderer.Text, { style: [styles.tableCell, styles.vatCell] }, 'BTW'),
					h(renderer.Text, { style: [styles.tableCell, styles.totalCell] }, 'Totaal')
				),
				...items.map(item => this.renderLineItem(item, renderer))
			)
		);
	}

	private renderLineItem(item: QuotePdfLineItem, renderer: ReactPdfRenderer): ReactElement {
		const lineTotals = calculateLineTotals(item);
		return h(
			renderer.View,
			{ style: styles.tableRow },
			h(renderer.Text, { style: [styles.tableCell, styles.descriptionCell] }, item.description),
			h(
				renderer.Text,
				{ style: [styles.tableCell, styles.quantityCell] },
				`${formatQuantity(item.quantity)} ${CATALOG_ITEM_UNIT_LABELS_NL[item.unit]}`
			),
			h(renderer.Text, { style: [styles.tableCell, styles.priceCell] }, formatEuro(toCents(item.unitPriceEur))),
			h(
				renderer.Text,
				{ style: [styles.tableCell, styles.vatCell] },
				item.vatReverseCharged ? 'verlegd' : `${item.vatRate}%`
			),
			h(renderer.Text, { style: [styles.tableCell, styles.totalCell] }, formatEuro(lineTotals.netCents))
		);
	}

	private renderTotals(totals: QuotePdfTotals, renderer: ReactPdfRenderer): ReactElement {
		return h(
			renderer.View,
			{ style: styles.totals },
			h(
				renderer.View,
				{ style: styles.totalRow },
				h(renderer.Text, null, 'Subtotaal'),
				h(renderer.Text, null, formatEuro(totals.netCents))
			),
			h(
				renderer.View,
				{ style: styles.totalRow },
				h(renderer.Text, null, 'BTW'),
				h(renderer.Text, null, formatEuro(totals.vatCents))
			),
			h(
				renderer.View,
				{ style: [styles.totalRow, styles.grandTotal] },
				h(renderer.Text, null, 'Totaal'),
				h(renderer.Text, null, formatEuro(totals.grossCents))
			)
		);
	}

	private renderPaymentTerms(input: QuotePdfRenderInput, renderer: ReactPdfRenderer): ReactElement {
		return h(
			renderer.View,
			{ style: styles.section },
			h(renderer.Text, { style: styles.sectionTitle }, 'Betaling'),
			h(
				renderer.Text,
				{ style: styles.muted },
				`Te voldoen binnen ${input.businessDetails.defaultPaymentTermsDays} dagen na ontvangst van de factuur.`
			)
		);
	}

	private renderFooter(input: QuotePdfRenderInput, renderer: ReactPdfRenderer): ReactElement {
		return h(
			renderer.Text,
			{ style: styles.footer },
			input.businessDetails.companyFooter ?? `Offerte opgesteld door ${input.businessDetails.name}.`
		);
	}
}

function h(type: ElementType, props: Record<string, unknown> | null, ...children: ReactNode[]): ReactElement {
	return createElement(type, props, ...children);
}

function renderOptionalText(value: string | null, style: unknown, renderer: ReactPdfRenderer): ReactElement | null {
	if (!value) {
		return null;
	}
	return h(renderer.Text, { style }, value);
}

function renderLines(value: string | null, style: unknown, renderer: ReactPdfRenderer): ReactElement | null {
	if (!value) {
		return null;
	}
	return h(
		renderer.View,
		null,
		...value
			.split(/\r?\n/)
			.filter(line => line.trim().length > 0)
			.map(line => h(renderer.Text, { style }, line.trim()))
	);
}

export function calculateTotals(items: QuotePdfLineItem[]): QuotePdfTotals {
	return items.reduce(
		(acc, item) => {
			const line = calculateLineTotals(item);
			return {
				netCents: acc.netCents + line.netCents,
				vatCents: acc.vatCents + line.vatCents,
				grossCents: acc.grossCents + line.grossCents
			};
		},
		{ netCents: 0, vatCents: 0, grossCents: 0 }
	);
}

export function calculateLineTotals(item: QuotePdfLineItem): QuotePdfLineTotals {
	const netCents = Math.round(toCents(item.unitPriceEur) * item.quantity);
	// Reverse-charge lines carry no VAT (the customer self-accounts it).
	const vatCents = item.vatReverseCharged ? 0 : Math.round((netCents * item.vatRate) / 100);
	return {
		netCents,
		vatCents,
		grossCents: netCents + vatCents
	};
}

function toCents(value: string): number {
	return Math.round(Number(value) * 100);
}

function formatEuro(cents: number): string {
	return new Intl.NumberFormat('nl-NL', {
		style: 'currency',
		currency: 'EUR',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(cents / 100);
}

function formatQuantity(value: number): string {
	return new Intl.NumberFormat('nl-NL', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2
	}).format(value);
}

function formatDate(value: Date): string {
	return new Intl.DateTimeFormat('nl-NL', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: BUSINESS_TIME_ZONE
	}).format(value);
}
