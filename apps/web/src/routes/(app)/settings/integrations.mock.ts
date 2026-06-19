/**
 * MOCK data for the Settings → Integraties surface.
 *
 * There is NO integrations backend yet — confirmed no `apps/api/src/modules`
 * for integrations / Moneybird / NetSuite / Celigo. This page is a
 * future-possibilities DEMO: it shows the intended shape (third-party
 * accounting / ERP / iPaaS connectors) plus the subscription upsell, so the
 * UI is ready once a real `integrations` API lands.
 *
 * Everything here is static, typed fixture data. All interactive controls on
 * the page (Verbinden / Vraag toegang aan / sync toggles / Wijzigingen opslaan
 * / Verbinding verbreken / Opnieuw verbinden / Open in … / Documentatie /
 * Vraag integratie aan / Bekijk de API) are inert by design — they persist
 * only local component state or do nothing.
 *
 * When a backend is scoped, swap `MOCK_INTEGRATIONS` for query/mutation hooks
 * (e.g. `integrationsQueryOptions` + connect/disconnect mutations) and delete
 * the `MOCK_` marker. Nothing here is persisted.
 */

export interface IntegrationSetting {
	id: string;
	label: string;
	on: boolean;
}

export interface Integration {
	id: string;
	name: string;
	category: string;
	region: string;
	description: string;
	status: 'connected' | 'available' | 'beta';
	accent: string;
	// The third-party app's own dashboard URL (deep link for "Open in {name}").
	externalUrl: string;
	connectedAt?: string;
	connectedAs?: string;
	connectedAccountName?: string;
	lastSync?: string;
	lastSyncOk?: boolean;
	invoicesThisMonth?: number;
	contactsSynced?: number;
	settings?: IntegrationSetting[];
	requires?: string;
	setupTimeMinutes?: number;
	capabilities?: string[];
}

export const MOCK_INTEGRATIONS: Integration[] = [
	{
		id: 'moneybird',
		name: 'Moneybird',
		category: 'Boekhouding',
		region: 'Nederland',
		description:
			'Maak van een gewonnen offerte automatisch een concept-factuur in Moneybird. Klantgegevens, regels en BTW worden direct overgenomen.',
		status: 'connected',
		accent: '#dd5a5a',
		externalUrl: 'https://moneybird.com',
		connectedAt: '12 maart 2026',
		connectedAs: 'selami@yildiz-installatie.nl',
		connectedAccountName: 'Yıldız Installatie B.V.',
		lastSync: '8 min geleden',
		lastSyncOk: true,
		invoicesThisMonth: 14,
		contactsSynced: 142,
		settings: [
			{ id: 'autoDraft', label: 'Automatisch concept-factuur aanmaken bij gewonnen offerte', on: true },
			{ id: 'syncContacts', label: 'Klantcontacten synchroniseren (beide kanten op)', on: true },
			{ id: 'useNumbering', label: 'Gebruik Moneybird-nummering voor offertes', on: false }
		]
	},
	{
		id: 'netsuite',
		name: 'NetSuite',
		category: 'ERP',
		region: 'Wereldwijd',
		description:
			'Synchroniseer offertes, klanten en orders met je NetSuite-omgeving. Geschikt voor bedrijven met meerdere vestigingen of een complexe rapportagestructuur.',
		status: 'available',
		accent: '#2c5283',
		externalUrl: 'https://www.netsuite.com',
		requires: 'Beheerder of Oracle-account',
		setupTimeMinutes: 25,
		capabilities: [
			'Tweezijdige sync van offertes en klanten',
			'Custom-fields toewijzen aan NetSuite-records',
			'Sandbox- en productie-omgeving los verbinden'
		]
	},
	{
		id: 'celigo',
		name: 'Celigo',
		category: 'Integratieplatform',
		region: 'Wereldwijd',
		description:
			"Verbind Offertum met >300 systemen (Salesforce, HubSpot, Shopify, custom API's) via Celigo's iPaaS. Geschikt voor maatwerk-workflows die out-of-the-box niet bestaan.",
		status: 'beta',
		accent: '#10a37f',
		externalUrl: 'https://www.celigo.com',
		requires: 'Celigo-account',
		capabilities: [
			'Bouw flows met de Celigo-Offertum-connector',
			'Geplande en realtime triggers',
			'Geschikt voor 100+ aanvragen per dag'
		]
	}
];
