import { escapeHtml } from '@/lib/mails/escape';
import { formatEmailEuros } from '@/lib/mails/format';
import { renderNotificationEmail, type RenderedEmail } from '@/lib/mails/notifications/template-shell';
import { pluralize } from '@offertum/shared';

interface DailyDigestRankedItem {
	customerName: string | null;
	requestType: string;
	valueEuros: number;
	rankReason: string;
}

interface DailyDigestExpiringItem {
	customerName: string | null;
	daysUntilExpiry: number;
	opportunityUrl: string;
}

export interface DailyDigestEmailInput {
	rankedItems: DailyDigestRankedItem[];
	expiringItems: DailyDigestExpiringItem[];
	totalOpenValueEuros: number;
	dashboardUrl: string;
}

// Inline-styled list row: a value chip + reason chip on a single linked line. Mirrors
// the shell's body type scale so the digest sits visually inside the same card.
function renderRankedRow(item: DailyDigestRankedItem, dashboardUrl: string): string {
	const name = escapeHtml(item.customerName ?? 'Aanvraag');
	const requestType = escapeHtml(item.requestType);
	return `<a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer" style="display: block; margin: 0 0 10px; padding: 12px 14px; background: #F6F7FB; border: 1px solid #E1E3EB; border-radius: 6px; text-decoration: none; color: #0B0E22;">
			<span style="display: block; font-size: 15px; font-weight: 600; color: #0B0E22;">${name}</span>
			<span style="display: block; margin-top: 2px; font-size: 13px; color: #555A70;">${requestType} &middot; ${formatEmailEuros(item.valueEuros)}</span>
			<span style="display: inline-block; margin-top: 8px; padding: 2px 10px; font-size: 12px; font-weight: 500; color: #1A237E; background: #E8EAF6; border-radius: 999px;">${item.rankReason}</span>
		</a>`;
}

function renderExpiringRow(item: DailyDigestExpiringItem): string {
	const name = escapeHtml(item.customerName ?? 'Aanvraag');
	const dayLabel = pluralize(item.daysUntilExpiry, 'dag', 'dagen');
	return `<a href="${item.opportunityUrl}" target="_blank" rel="noopener noreferrer" style="display: block; margin: 0 0 8px; font-size: 14px; color: #1A237E; text-decoration: none;">${name} — verloopt over ${item.daysUntilExpiry} ${dayLabel}</a>`;
}

export function buildDailyDigestEmail(input: DailyDigestEmailInput): RenderedEmail {
	const { rankedItems, expiringItems, totalOpenValueEuros, dashboardUrl } = input;
	const subject = `Vandaag belangrijk: ${rankedItems.length} offerteaanvragen`;

	const rankedHtml =
		rankedItems.length > 0
			? rankedItems.map(item => renderRankedRow(item, dashboardUrl)).join('')
			: `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.55; color: #555A70;">Er zijn vandaag geen openstaande aanvragen die aandacht vragen.</p>`;

	const paragraphs: string[] = [
		`<span style="display: block; margin-bottom: 12px; font-size: 15px; line-height: 1.55; color: #262A40;">Dit zijn je belangrijkste openstaande aanvragen voor vandaag.</span>${rankedHtml}`
	];

	if (expiringItems.length > 0) {
		const expiringHtml = expiringItems.map(renderExpiringRow).join('');
		paragraphs.push(
			`<span style="display: block; margin: 8px 0 10px; font-size: 14px; font-weight: 600; color: #0B0E22;">Verloopt binnenkort</span>${expiringHtml}`
		);
	}

	paragraphs.push(`Totale openstaande waarde: <strong>${formatEmailEuros(totalOpenValueEuros)}</strong>.`);

	return renderNotificationEmail({
		subject,
		heading: 'Vandaag belangrijk',
		preheader: `${rankedItems.length} aanvragen · ${formatEmailEuros(totalOpenValueEuros)} open waarde`,
		bodyParagraphs: paragraphs,
		cta: { label: 'Bekijk in app', url: dashboardUrl },
		footnote:
			'Wil je deze e-mail niet meer ontvangen? Pas je voorkeuren aan via Instellingen → Notificaties in Offertum.'
	});
}
