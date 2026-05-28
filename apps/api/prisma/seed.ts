import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../.env') });

import type { CatalogItemUnit } from '@offertum/shared';
import { createHash } from 'node:crypto';
import {
	EmailProvider,
	LogLevel,
	MembershipRole,
	OpportunityStatus,
	type Prisma,
	PricingRuleType,
	PrismaClient,
	Urgency
} from '../src/generated/prisma/client';

const prisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
});

// Fixed UUIDs so re-running the seed is idempotent and you can refer to orgs
// in tests/curl by literal ID.
const ORG_ACME = '00000000-0000-0000-0000-000000000001';
const ORG_BOUW = '00000000-0000-0000-0000-000000000002';

const orgs = [
	{ id: ORG_ACME, name: 'Acme Installaties' },
	{ id: ORG_BOUW, name: 'Bouwbedrijf de Vries' }
] as const;

const users = [
	{ email: 'selami1992@gmail.com', name: 'Selami C', currentOrg: ORG_ACME },
	{ email: 'jeroen@offertum.dev', name: 'Jeroen Bakker', currentOrg: ORG_ACME },
	{ email: 'bart@offertum.dev', name: 'Bart de Vries', currentOrg: ORG_BOUW },
	{ email: 'sander@offertum.dev', name: 'Sander van Klink', currentOrg: ORG_ACME }
] as const;

const memberships: ReadonlyArray<{ email: string; orgId: string; role: MembershipRole }> = [
	{ email: 'selami1992@gmail.com', orgId: ORG_ACME, role: MembershipRole.OWNER },
	{ email: 'jeroen@offertum.dev', orgId: ORG_ACME, role: MembershipRole.MEMBER },
	{ email: 'bart@offertum.dev', orgId: ORG_BOUW, role: MembershipRole.OWNER },
	// Sander is a freelance bookkeeper helping both orgs — same user, two memberships.
	{ email: 'sander@offertum.dev', orgId: ORG_ACME, role: MembershipRole.EXTERNAL },
	{ email: 'sander@offertum.dev', orgId: ORG_BOUW, role: MembershipRole.EXTERNAL }
];

// Stub EmailAccount per org — required because Opportunity FK-references one.
// Tokens are nonsense; these accounts will never actually sync. Soft-disconnected
// via `disconnectedAt` so the UI's "is connected" check doesn't surface them.
const SEED_EMAIL_ACCOUNT_ACME = '11111111-1111-1111-1111-000000000001';
const SEED_EMAIL_ACCOUNT_BOUW = '11111111-1111-1111-1111-000000000002';

const emailAccounts = [
	{
		id: SEED_EMAIL_ACCOUNT_ACME,
		organizationId: ORG_ACME,
		ownerEmail: 'selami1992@gmail.com',
		mailboxEmail: 'inbox+seed@acme-installaties.nl'
	},
	{
		id: SEED_EMAIL_ACCOUNT_BOUW,
		organizationId: ORG_BOUW,
		ownerEmail: 'bart@offertum.dev',
		mailboxEmail: 'offertes+seed@bouwbedrijfdevries.nl'
	}
] as const;

// Wrap a plain-text body in the minimal Gmail payload shape that
// `buildRawMessageAIInput` (src/lib/email/raw-message-ai-input.ts) knows how to
// decode, so seeded opportunities render a real original email in the detail view.
function gmailTextPayload(bodyText: string): Prisma.InputJsonValue {
	return {
		seed: true,
		note: 'Synthetic RawMessage produced by prisma/seed.ts — not a real provider payload.',
		payload: {
			mimeType: 'text/plain',
			body: { data: Buffer.from(bodyText, 'utf8').toString('base64url') }
		}
	};
}

interface SeedOpportunity {
	rawMessageId: string;
	opportunityId: string;
	organizationId: string;
	emailAccountId: string;
	subject: string;
	fromEmail: string;
	fromName: string;
	/** Plain-text email body, embedded in the RawMessage `raw` as a Gmail
	 * `text/plain` payload so the detail view renders an original email. */
	bodyText: string;
	customerName: string;
	customerEmail: string;
	address: string | null;
	requestType: string;
	urgency: Urgency;
	status: OpportunityStatus;
	classifierConfidence: number;
	classifierReason: string;
	deliverableHints: Prisma.InputJsonValue;
	internalDateDaysAgo: number;
	deadlineDaysFromNow: number | null;
	appointmentDaysFromNow: number | null;
}

// Ten varied opportunities spanning both seed orgs, every status, urgency mix,
// and realistic Dutch SMB scenarios (installateur, bouwbedrijf, schilder, etc.).
// Fixed IDs so re-running the seed upserts in place — no duplicates on every run.
const opportunities: ReadonlyArray<SeedOpportunity> = [
	{
		rawMessageId: '22222222-0001-0000-0000-000000000001',
		opportunityId: '33333333-0001-0000-0000-000000000001',
		organizationId: ORG_ACME,
		emailAccountId: SEED_EMAIL_ACCOUNT_ACME,
		subject: 'Offerte aanvragen voor CV-ketel vervanging',
		fromEmail: 'marieke.jansen@example.nl',
		fromName: 'Marieke Jansen',
		bodyText: [
			'Geachte heer/mevrouw,',
			'',
			'Onze CV-ketel (een Remeha Calenta 25c) is inmiddels ruim 14 jaar oud en aan vervanging toe. Wij wonen in een tussenwoning in Amersfoort en zouden graag overstappen op een hybride opstelling met een warmtepomp.',
			'',
			'Kunt u een offerte opstellen voor het vervangen van de ketel en het plaatsen van een hybride warmtepomp? Een afspraak voor een inspectie ter plaatse is wat ons betreft prima.',
			'',
			'Met vriendelijke groet,',
			'Marieke Jansen',
			'Hoofdstraat 12, 3811 EN Amersfoort'
		].join('\n'),
		customerName: 'Marieke Jansen',
		customerEmail: 'marieke.jansen@example.nl',
		address: 'Hoofdstraat 12, 3811 EN Amersfoort',
		requestType: 'CV-ketel vervanging (gas → hybride warmtepomp)',
		urgency: Urgency.NORMAL,
		status: OpportunityStatus.NEW,
		classifierConfidence: 0.94,
		classifierReason: 'Expliciete offerte-aanvraag met locatie + werkzaamheden.',
		deliverableHints: ['Remeha Calenta 25c', 'hybride warmtepomp', 'tussenwoning', 'CV-ketel vervangen'],
		internalDateDaysAgo: 1,
		deadlineDaysFromNow: 21,
		appointmentDaysFromNow: 7
	},
	{
		rawMessageId: '22222222-0002-0000-0000-000000000002',
		opportunityId: '33333333-0002-0000-0000-000000000002',
		organizationId: ORG_ACME,
		emailAccountId: SEED_EMAIL_ACCOUNT_ACME,
		subject: 'SPOED: lekkage badkamer eerste verdieping',
		fromEmail: 'pieter.devos@example.nl',
		fromName: 'Pieter de Vos',
		bodyText: [
			'Goedemiddag,',
			'',
			'Wij hebben sinds vanochtend een lekkage in de badkamer op de eerste verdieping. Er komt water door het plafond van de gang eronder en het lijkt erger te worden.',
			'',
			'Kunnen jullie met spoed langskomen? Dit kan echt niet wachten tot volgende week.',
			'',
			'Groet,',
			'Pieter de Vos',
			'Kerkstraat 88, 1011 AB Amsterdam',
			'Tel: 06-12345678'
		].join('\n'),
		customerName: 'Pieter de Vos',
		customerEmail: 'pieter.devos@example.nl',
		address: 'Kerkstraat 88, 1011 AB Amsterdam',
		requestType: 'Loodgieterswerk — acute lekkage badkamervloer',
		urgency: Urgency.EMERGENCY,
		status: OpportunityStatus.NEW,
		classifierConfidence: 0.99,
		classifierReason: 'Spoedklus met duidelijke locatie en symptoom.',
		deliverableHints: ['lekkage badkamervloer', 'eerste verdieping', 'zichtbare waterschade plafond'],
		internalDateDaysAgo: 0,
		deadlineDaysFromNow: 1,
		appointmentDaysFromNow: 0
	},
	{
		rawMessageId: '22222222-0003-0000-0000-000000000003',
		opportunityId: '33333333-0003-0000-0000-000000000003',
		organizationId: ORG_ACME,
		emailAccountId: SEED_EMAIL_ACCOUNT_ACME,
		subject: 'Vraag — aansluiten inductiekookplaat',
		fromEmail: 'lisa.bakker@example.nl',
		fromName: 'Lisa Bakker',
		bodyText: [
			'Hallo,',
			'',
			'Wij hebben een nieuwe inductiekookplaat gekocht (7,4 kW) die een krachtstroomaansluiting nodig heeft. Op dit moment hebben we in de keuken alleen een gewoon stopcontact.',
			'',
			'Kunnen jullie een aparte groep aanleggen in de meterkast en de kookplaat aansluiten? Graag verneem ik wat dit ongeveer kost en wanneer jullie kunnen langskomen.',
			'',
			'Met vriendelijke groet,',
			'Lisa Bakker',
			'Lange Voorhout 4, 2514 EE Den Haag'
		].join('\n'),
		customerName: 'Lisa Bakker',
		customerEmail: 'lisa.bakker@example.nl',
		address: 'Lange Voorhout 4, 2514 EE Den Haag',
		requestType: 'Elektra — krachtstroomgroep inductiekookplaat',
		urgency: Urgency.HIGH,
		status: OpportunityStatus.REPLIED,
		classifierConfidence: 0.91,
		classifierReason: 'Specifieke installatie met datum-indicatie.',
		deliverableHints: ['inductiekookplaat 7,4 kW', 'krachtstroomgroep', 'meterkast uitbreiden'],
		internalDateDaysAgo: 4,
		deadlineDaysFromNow: 14,
		appointmentDaysFromNow: null
	},
	{
		rawMessageId: '22222222-0004-0000-0000-000000000004',
		opportunityId: '33333333-0004-0000-0000-000000000004',
		organizationId: ORG_ACME,
		emailAccountId: SEED_EMAIL_ACCOUNT_ACME,
		subject: 'Offerte airco woonkamer + slaapkamer',
		fromEmail: 'jurgen@bedrijfx.nl',
		fromName: 'Jurgen ten Have',
		bodyText: [
			'Beste,',
			'',
			'Ik zou graag een offerte ontvangen voor een airco-installatie. Het gaat om een multi-split systeem met twee binnenunits: één in de woonkamer (ca. 35 m²) en één in de slaapkamer (ca. 14 m²). De woning is goed geïsoleerd.',
			'',
			'Kunt u aangeven wat de kosten zijn inclusief montage en plaatsing van de buitenunit?',
			'',
			'Met vriendelijke groet,',
			'Jurgen ten Have',
			'Industrieweg 22, 5708 AK Helmond'
		].join('\n'),
		customerName: 'Jurgen ten Have',
		customerEmail: 'jurgen@bedrijfx.nl',
		address: 'Industrieweg 22, 5708 AK Helmond',
		requestType: 'Airco — multi-split twee binnenunits',
		urgency: Urgency.NORMAL,
		status: OpportunityStatus.WAITING,
		classifierConfidence: 0.87,
		classifierReason: 'Offerte-aanvraag, klant wacht op prijs.',
		deliverableHints: ['multi-split airco', 'twee binnenunits', 'woonkamer ~35 m²', 'slaapkamer ~14 m²'],
		internalDateDaysAgo: 9,
		deadlineDaysFromNow: 30,
		appointmentDaysFromNow: null
	},
	{
		rawMessageId: '22222222-0005-0000-0000-000000000005',
		opportunityId: '33333333-0005-0000-0000-000000000005',
		organizationId: ORG_ACME,
		emailAccountId: SEED_EMAIL_ACCOUNT_ACME,
		subject: 'Onderhoud cv — jaarbeurt 2026',
		fromEmail: 'familie.vanderberg@example.nl',
		fromName: 'Familie van der Berg',
		bodyText: [
			'Geachte,',
			'',
			'Wij willen graag een jaarlijks onderhoudscontract afsluiten voor onze CV-ketel. De ketel is 3 jaar oud en nog in goede staat; we willen vooral de jaarbeurt netjes geregeld hebben.',
			'',
			'Kunt u ons informeren over de mogelijkheden en de jaarlijkse kosten?',
			'',
			'Vriendelijke groet,',
			'Familie van der Berg',
			'Dorpsstraat 3, 7152 GE Eibergen'
		].join('\n'),
		customerName: 'Familie van der Berg',
		customerEmail: 'familie.vanderberg@example.nl',
		address: 'Dorpsstraat 3, 7152 GE Eibergen',
		requestType: 'CV jaarlijks onderhoudscontract',
		urgency: Urgency.LOW,
		status: OpportunityStatus.WON,
		classifierConfidence: 0.96,
		classifierReason: 'Terugkerend onderhoudscontract.',
		deliverableHints: ['jaarlijks onderhoudscontract', 'CV-jaarbeurt'],
		internalDateDaysAgo: 30,
		deadlineDaysFromNow: null,
		appointmentDaysFromNow: 21
	},
	{
		rawMessageId: '22222222-0006-0000-0000-000000000006',
		opportunityId: '33333333-0006-0000-0000-000000000006',
		organizationId: ORG_BOUW,
		emailAccountId: SEED_EMAIL_ACCOUNT_BOUW,
		subject: 'Verbouwing achterkamer — schatting kosten',
		fromEmail: 'sara.kuipers@example.nl',
		fromName: 'Sara Kuipers',
		bodyText: [
			'Hallo,',
			'',
			'Wij overwegen een uitbouw aan de achterkant van onze woning van ongeveer 12 m². Het gaat om het vergroten van de achterkamer met een plat dak. We hebben nog geen tekeningen, maar wel een duidelijk idee voor ogen.',
			'',
			'Zouden jullie een eerste kostenschatting kunnen maken en langskomen om de situatie te bekijken?',
			'',
			'Met vriendelijke groet,',
			'Sara Kuipers',
			'Brouwersgracht 41, 1015 GA Amsterdam'
		].join('\n'),
		customerName: 'Sara Kuipers',
		customerEmail: 'sara.kuipers@example.nl',
		address: 'Brouwersgracht 41, 1015 GA Amsterdam',
		requestType: 'Verbouwing — uitbouw achterkamer ~12 m²',
		urgency: Urgency.NORMAL,
		status: OpportunityStatus.NEW,
		classifierConfidence: 0.92,
		classifierReason: 'Concreet project met afmetingen.',
		deliverableHints: ['uitbouw ~12 m²', 'achterkamer', 'plat dak', 'geen tekeningen'],
		internalDateDaysAgo: 2,
		deadlineDaysFromNow: 45,
		appointmentDaysFromNow: 5
	},
	{
		rawMessageId: '22222222-0007-0000-0000-000000000007',
		opportunityId: '33333333-0007-0000-0000-000000000007',
		organizationId: ORG_BOUW,
		emailAccountId: SEED_EMAIL_ACCOUNT_BOUW,
		subject: 'Vraag — dakkapel plaatsen',
		fromEmail: 'tom.visser@example.nl',
		fromName: 'Tom Visser',
		bodyText: [
			'Beste,',
			'',
			'Wij willen aan de voorzijde van ons huis een dakkapel laten plaatsen van ongeveer 2,5 meter breed, om de zolder bruikbaar te maken als slaapkamer. We hebben nog geen vergunning aangevraagd.',
			'',
			'Kunnen jullie een offerte maken en daarbij aangeven of jullie ook de vergunningsaanvraag kunnen verzorgen?',
			'',
			'Groet,',
			'Tom Visser',
			'Wilgenlaan 17, 3742 BX Baarn'
		].join('\n'),
		customerName: 'Tom Visser',
		customerEmail: 'tom.visser@example.nl',
		address: 'Wilgenlaan 17, 3742 BX Baarn',
		requestType: 'Dakkapel — voorzijde ~2,5 m breed',
		urgency: Urgency.NORMAL,
		status: OpportunityStatus.REPLIED,
		classifierConfidence: 0.93,
		classifierReason: 'Klassieke offerte-aanvraag dakkapel.',
		deliverableHints: ['dakkapel ~2,5 m breed', 'voorzijde', 'zolder als slaapkamer', 'vergunning nodig'],
		internalDateDaysAgo: 7,
		deadlineDaysFromNow: 60,
		appointmentDaysFromNow: null
	},
	{
		rawMessageId: '22222222-0008-0000-0000-000000000008',
		opportunityId: '33333333-0008-0000-0000-000000000008',
		organizationId: ORG_BOUW,
		emailAccountId: SEED_EMAIL_ACCOUNT_BOUW,
		subject: 'Re: badkamerrenovatie — meer info',
		fromEmail: 'familie.geerts@example.nl',
		fromName: 'Familie Geerts',
		bodyText: [
			'Beste,',
			'',
			'Naar aanleiding van jullie vorige bericht stuur ik wat aanvullende informatie. De badkamer is ongeveer 8 m². We willen graag een complete renovatie: alles eruit en nieuw, inclusief een inloopdouche met regendouche.',
			'',
			'Kunnen jullie op basis hiervan de offerte aanvullen?',
			'',
			'Met vriendelijke groet,',
			'Familie Geerts',
			'Oranjestraat 25, 6711 GG Ede'
		].join('\n'),
		customerName: 'Familie Geerts',
		customerEmail: 'familie.geerts@example.nl',
		address: 'Oranjestraat 25, 6711 GG Ede',
		requestType: 'Badkamerrenovatie — complete strip + nieuw',
		urgency: Urgency.HIGH,
		status: OpportunityStatus.WAITING,
		classifierConfidence: 0.95,
		classifierReason: 'Vervolgvraag op eerdere offerte met aanvullende info.',
		deliverableHints: ['badkamer ~8 m²', 'complete renovatie', 'inloopdouche', 'regendouche'],
		internalDateDaysAgo: 12,
		deadlineDaysFromNow: 21,
		appointmentDaysFromNow: 3
	},
	{
		rawMessageId: '22222222-0009-0000-0000-000000000009',
		opportunityId: '33333333-0009-0000-0000-000000000009',
		organizationId: ORG_BOUW,
		emailAccountId: SEED_EMAIL_ACCOUNT_BOUW,
		subject: 'Offerte schuur isoleren',
		fromEmail: 'wouter.smits@example.nl',
		fromName: 'Wouter Smits',
		bodyText: [
			'Hallo,',
			'',
			'Ik heb een vrijstaande schuur van ongeveer 18 m² die op dit moment helemaal niet geïsoleerd is. Ik wil de schuur als werkruimte gaan gebruiken en daarom de wanden en het dak laten isoleren.',
			'',
			'Kunnen jullie een offerte maken voor het isoleren?',
			'',
			'Met vriendelijke groet,',
			'Wouter Smits',
			'Schoolweg 9, 8061 BB Hasselt'
		].join('\n'),
		customerName: 'Wouter Smits',
		customerEmail: 'wouter.smits@example.nl',
		address: 'Schoolweg 9, 8061 BB Hasselt',
		requestType: 'Isolatie — vrijstaande schuur 18 m²',
		urgency: Urgency.LOW,
		status: OpportunityStatus.COLD,
		classifierConfidence: 0.88,
		classifierReason: 'Isolatiewerkzaamheden, klant niet gereageerd na 2 herinneringen.',
		deliverableHints: ['vrijstaande schuur ~18 m²', 'wand- en dakisolatie', 'geen huidige isolatie'],
		internalDateDaysAgo: 28,
		deadlineDaysFromNow: null,
		appointmentDaysFromNow: null
	},
	{
		rawMessageId: '22222222-0010-0000-0000-000000000010',
		opportunityId: '33333333-0010-0000-0000-000000000010',
		organizationId: ORG_BOUW,
		emailAccountId: SEED_EMAIL_ACCOUNT_BOUW,
		subject: 'Vraag offerte — keukenrenovatie',
		fromEmail: 'jasper.koopmans@example.nl',
		fromName: 'Jasper Koopmans',
		bodyText: [
			'Beste,',
			'',
			'Wij willen onze keuken renoveren met een IKEA Metod inbouwkeuken die we zelf aanschaffen. We zoeken iemand die de montage verzorgt, inclusief het inbouwen en aansluiten van de apparatuur.',
			'',
			'Kunnen jullie een offerte uitbrengen voor de montage?',
			'',
			'Met vriendelijke groet,',
			'Jasper Koopmans',
			'Markt 14, 5611 EB Eindhoven'
		].join('\n'),
		customerName: 'Jasper Koopmans',
		customerEmail: 'jasper.koopmans@example.nl',
		address: 'Markt 14, 5611 EB Eindhoven',
		requestType: 'Keukenrenovatie — IKEA Metod inbouw',
		urgency: Urgency.NORMAL,
		status: OpportunityStatus.LOST,
		classifierConfidence: 0.9,
		classifierReason: 'Keukenofferte, klant koos andere aannemer.',
		deliverableHints: ['IKEA Metod inbouwkeuken', 'montage', 'apparatuur inbouwen en aansluiten'],
		internalDateDaysAgo: 60,
		deadlineDaysFromNow: null,
		appointmentDaysFromNow: null
	}
];

interface SeedCatalogItem {
	id: string;
	organizationId: string;
	name: string;
	description: string | null;
	defaultPriceEur: string;
	defaultVatRate: number;
	sku: string | null;
	unit: CatalogItemUnit;
	active: boolean;
}

// ~5 catalog items per org so `/settings/catalog` has content on a fresh DB.
// Fixed UUIDs make `pnpm db:seed` idempotent — re-running upserts in place
// instead of stacking duplicates. Acme = installer (uur-based services);
// Bouwbedrijf = builder (mostly project + day-based work).
const catalogItems: ReadonlyArray<SeedCatalogItem> = [
	// Acme Installaties (installer)
	{
		id: '44444444-0001-0000-0000-000000000001',
		organizationId: ORG_ACME,
		name: 'Installatie-uurtarief',
		description: 'Standaard uurtarief voor monteur op locatie.',
		defaultPriceEur: '75.00',
		defaultVatRate: 21,
		sku: 'INST-HR',
		unit: 'hour',
		active: true
	},
	{
		id: '44444444-0001-0000-0000-000000000002',
		organizationId: ORG_ACME,
		name: 'CV-ketel onderhoudsbeurt',
		description: 'Jaarlijkse onderhoudsbeurt inclusief afdichtingscontrole.',
		defaultPriceEur: '129.00',
		defaultVatRate: 21,
		sku: 'CV-MAINT',
		unit: 'flat_fee',
		active: true
	},
	{
		id: '44444444-0001-0000-0000-000000000003',
		organizationId: ORG_ACME,
		name: 'Voorrijkosten regio Utrecht',
		description: 'Vast bedrag binnen 25 km van de werkplaats.',
		defaultPriceEur: '35.00',
		defaultVatRate: 21,
		sku: 'TRAVEL-UTR',
		unit: 'flat_fee',
		active: true
	},
	{
		id: '44444444-0001-0000-0000-000000000004',
		organizationId: ORG_ACME,
		name: 'Krachtstroomgroep aansluiten',
		description: '400V groep, inclusief automaat — exclusief kabelwerk.',
		defaultPriceEur: '185.00',
		defaultVatRate: 21,
		sku: 'ELEK-400V',
		unit: 'piece',
		active: true
	},
	{
		id: '44444444-0001-0000-0000-000000000005',
		organizationId: ORG_ACME,
		name: 'Installatiekabel 3×2,5 mm²',
		description: 'YMvK gris per strekkende meter, inclusief verleggen.',
		defaultPriceEur: '4.95',
		defaultVatRate: 21,
		sku: 'CABLE-YMVK-2.5',
		unit: 'meter',
		active: true
	},
	// Bouwbedrijf de Vries (builder)
	{
		id: '44444444-0002-0000-0000-000000000001',
		organizationId: ORG_BOUW,
		name: 'Bouwvakker dagtarief',
		description: 'Volledige dag (8 uur) inclusief klein gereedschap.',
		defaultPriceEur: '425.00',
		defaultVatRate: 21,
		sku: 'BV-DAY',
		unit: 'day',
		active: true
	},
	{
		id: '44444444-0002-0000-0000-000000000002',
		organizationId: ORG_BOUW,
		name: 'Badkamer strippen',
		description: 'Compleet verwijderen incl. tegels, sanitair en afvoer van puin.',
		defaultPriceEur: '1450.00',
		defaultVatRate: 21,
		sku: 'BAD-STRIP',
		unit: 'flat_fee',
		active: true
	},
	{
		id: '44444444-0002-0000-0000-000000000003',
		organizationId: ORG_BOUW,
		name: 'Tegelwerk wand',
		description: 'Inclusief lijm + voegen, exclusief tegels.',
		defaultPriceEur: '55.00',
		defaultVatRate: 21,
		sku: 'TILE-WALL',
		unit: 'square_meter',
		active: true
	},
	{
		id: '44444444-0002-0000-0000-000000000004',
		organizationId: ORG_BOUW,
		name: 'Dakkapel basismodel 2 m',
		description: 'Standaard dakkapel 2 m breed, inclusief plaatsing.',
		defaultPriceEur: '6850.00',
		defaultVatRate: 9,
		sku: 'DK-2M',
		unit: 'piece',
		active: true
	},
	{
		id: '44444444-0002-0000-0000-000000000005',
		organizationId: ORG_BOUW,
		name: 'Container 6 m³ — puin',
		description: 'Plaatsing + afvoer puincontainer op locatie.',
		defaultPriceEur: '275.00',
		defaultVatRate: 21,
		sku: 'CONT-6M3',
		unit: 'piece',
		active: false
	}
];

// Ready-compiled pricing playbook for Acme so the W10 quote pipeline produces a
// rich, multi-bracket quote on a fresh DB without running the LLM compile pass.
// Mirrors the five rules an owner would get by compiling the prose below.
const ACME_PRICING_PLAYBOOK_ID = '66666666-0000-0000-0000-000000000001';
const ACME_PLAYBOOK_TEXT = [
	'Spoedaanvragen (urgentie: emergency) krijgen een spoedtoeslag van 35% over het totaal.',
	'',
	'Ons uurtarief voor een monteur op locatie is € 85 per uur.',
	'',
	'We rekenen € 45 voorrijkosten per offerte.',
	'',
	'We hanteren een minimumorderbedrag van € 175 exclusief btw.',
	'',
	'Voor arbeid geldt het verlaagde btw-tarief van 9%.'
].join('\n');

interface SeedPricingRule {
	id: string;
	ruleType: PricingRuleType;
	condition: Prisma.InputJsonValue;
	effect: Prisma.InputJsonValue;
	description: string;
}

const acmePricingRules: ReadonlyArray<SeedPricingRule> = [
	{
		id: '66666666-0001-0000-0000-000000000001',
		ruleType: PricingRuleType.URGENCY,
		condition: { urgency: 'emergency' },
		effect: { type: 'surcharge_percent', value: 35 },
		description: 'Spoedtoeslag: 35% bij urgentie'
	},
	{
		id: '66666666-0001-0000-0000-000000000002',
		ruleType: PricingRuleType.HOURLY_RATE,
		condition: { lineKind: 'labor' },
		effect: { type: 'rate_eur_per_hour', value: 85 },
		description: 'Uurtarief monteur: €85/uur'
	},
	{
		id: '66666666-0001-0000-0000-000000000003',
		ruleType: PricingRuleType.TRAVEL,
		condition: {},
		effect: { type: 'flat_fee_eur', value: 45 },
		description: 'Voorrijkosten: €45 per offerte'
	},
	{
		id: '66666666-0001-0000-0000-000000000004',
		ruleType: PricingRuleType.MINIMUM_ORDER,
		condition: {},
		effect: { type: 'minimum_eur', value: 175 },
		description: 'Minimumorderbedrag: €175 exclusief btw'
	},
	{
		id: '66666666-0001-0000-0000-000000000005',
		ruleType: PricingRuleType.VAT,
		condition: { lineKind: 'labor' },
		effect: { type: 'vat_rate', value: 9 },
		description: 'Verlaagd btw-tarief arbeid: 9%'
	}
];

function daysAgo(days: number): Date {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function daysFromNow(days: number): Date {
	return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function main() {
	for (const org of orgs) {
		await prisma.organization.upsert({
			where: { id: org.id },
			update: { name: org.name },
			create: { id: org.id, name: org.name }
		});
	}

	for (const user of users) {
		await prisma.user.upsert({
			where: { email: user.email },
			update: { name: user.name, currentOrganizationId: user.currentOrg },
			create: { email: user.email, name: user.name, currentOrganizationId: user.currentOrg }
		});
	}

	for (const m of memberships) {
		const user = await prisma.user.findUniqueOrThrow({ where: { email: m.email } });
		await prisma.membership.upsert({
			where: { userId_organizationId: { userId: user.id, organizationId: m.orgId } },
			update: { role: m.role },
			create: { userId: user.id, organizationId: m.orgId, role: m.role }
		});
	}

	for (const account of emailAccounts) {
		const owner = await prisma.user.findUniqueOrThrow({ where: { email: account.ownerEmail } });
		await prisma.emailAccount.upsert({
			where: { id: account.id },
			update: {
				organizationId: account.organizationId,
				userId: owner.id,
				email: account.mailboxEmail
			},
			create: {
				id: account.id,
				organizationId: account.organizationId,
				userId: owner.id,
				provider: EmailProvider.GMAIL,
				providerAccountId: `seed-${account.id}`,
				email: account.mailboxEmail,
				scope: 'https://www.googleapis.com/auth/gmail.readonly',
				accessToken: 'seed-placeholder',
				refreshToken: 'seed-placeholder',
				// Soft-disconnected so the dev UI doesn't think this is a live mailbox.
				disconnectedAt: new Date()
			}
		});
	}

	for (const opp of opportunities) {
		const owner = await prisma.user.findUniqueOrThrow({
			where: { email: opp.organizationId === ORG_ACME ? 'selami1992@gmail.com' : 'bart@offertum.dev' }
		});
		const account = emailAccounts.find(a => a.id === opp.emailAccountId);
		if (!account) {
			throw new Error(
				`Seed misconfiguration: no email account ${opp.emailAccountId} for opp ${opp.opportunityId}`
			);
		}

		await prisma.rawMessage.upsert({
			where: { id: opp.rawMessageId },
			update: {
				subject: opp.subject,
				fromEmail: opp.fromEmail,
				fromName: opp.fromName,
				raw: gmailTextPayload(opp.bodyText),
				isQuoteRequest: true,
				classifiedAt: daysAgo(opp.internalDateDaysAgo)
			},
			create: {
				id: opp.rawMessageId,
				emailAccountId: opp.emailAccountId,
				organizationId: opp.organizationId,
				providerMessageId: `seed-msg-${opp.rawMessageId}`,
				threadId: `seed-thread-${opp.rawMessageId}`,
				internalDate: daysAgo(opp.internalDateDaysAgo),
				subject: opp.subject,
				fromEmail: opp.fromEmail,
				fromName: opp.fromName,
				raw: gmailTextPayload(opp.bodyText),
				isQuoteRequest: true,
				classifiedAt: daysAgo(opp.internalDateDaysAgo)
			}
		});

		await prisma.opportunity.upsert({
			where: { id: opp.opportunityId },
			update: {
				status: opp.status,
				customerName: opp.customerName,
				customerEmail: opp.customerEmail,
				address: opp.address,
				requestType: opp.requestType,
				urgency: opp.urgency,
				classifierConfidence: opp.classifierConfidence,
				classifierReason: opp.classifierReason,
				deliverableHints: opp.deliverableHints,
				customerDeadline: opp.deadlineDaysFromNow !== null ? daysFromNow(opp.deadlineDaysFromNow) : null,
				customerAppointment:
					opp.appointmentDaysFromNow !== null ? daysFromNow(opp.appointmentDaysFromNow) : null,
				assignedToUserId: owner.id
			},
			create: {
				id: opp.opportunityId,
				organizationId: opp.organizationId,
				emailAccountId: opp.emailAccountId,
				rawMessageId: opp.rawMessageId,
				status: opp.status,
				aiProvider: 'seed/none',
				classifierConfidence: opp.classifierConfidence,
				classifierReason: opp.classifierReason,
				customerName: opp.customerName,
				customerEmail: opp.customerEmail,
				address: opp.address,
				requestType: opp.requestType,
				urgency: opp.urgency,
				customerDeadline: opp.deadlineDaysFromNow !== null ? daysFromNow(opp.deadlineDaysFromNow) : null,
				customerAppointment:
					opp.appointmentDaysFromNow !== null ? daysFromNow(opp.appointmentDaysFromNow) : null,
				deliverableHints: opp.deliverableHints,
				assignedToUserId: owner.id,
				createdAt: daysAgo(opp.internalDateDaysAgo)
			}
		});

		// Mirror the production `opportunity.received_via_mailbox` audit row so the
		// detail timeline shows a "Binnengekomen" event. The mapper prefers
		// `originatingInternalDate` over `Log.createdAt` for the displayed time.
		const receivedAt = daysAgo(opp.internalDateDaysAgo);
		const receivedLogId = opp.opportunityId.replace(/^33333333/, '55555555');
		await prisma.log.upsert({
			where: { id: receivedLogId },
			update: {},
			create: {
				id: receivedLogId,
				level: LogLevel.INFO,
				message: `Opportunity ${opp.opportunityId} received via mailbox ${account.mailboxEmail}`,
				context: 'OpportunitiesService',
				organizationId: opp.organizationId,
				createdAt: receivedAt,
				metadata: {
					action: 'opportunity.received_via_mailbox',
					organizationId: opp.organizationId,
					opportunityId: opp.opportunityId,
					mailboxEmail: account.mailboxEmail,
					mailboxOwnerUserId: owner.id,
					mailboxOwnerName: owner.name,
					originatingRawMessageId: opp.rawMessageId,
					originatingInternalDate: receivedAt.toISOString()
				}
			}
		});
	}

	for (const item of catalogItems) {
		await prisma.catalogItem.upsert({
			where: { id: item.id },
			update: {
				name: item.name,
				description: item.description,
				defaultPriceEur: item.defaultPriceEur as unknown as Prisma.Decimal,
				defaultVatRate: item.defaultVatRate,
				sku: item.sku,
				unit: item.unit,
				active: item.active
			},
			create: {
				id: item.id,
				organizationId: item.organizationId,
				name: item.name,
				description: item.description,
				defaultPriceEur: item.defaultPriceEur as unknown as Prisma.Decimal,
				defaultVatRate: item.defaultVatRate,
				sku: item.sku,
				unit: item.unit,
				active: item.active
			}
		});
	}

	// Acme pricing playbook + pre-compiled rules (W10 quote pipeline test data).
	const acmePlaybookHash = createHash('sha256').update(ACME_PLAYBOOK_TEXT).digest('hex');
	const acmePlaybook = await prisma.pricingPlaybook.upsert({
		where: { organizationId: ORG_ACME },
		update: { playbookText: ACME_PLAYBOOK_TEXT, compiledAt: new Date(), compiledHash: acmePlaybookHash },
		create: {
			id: ACME_PRICING_PLAYBOOK_ID,
			organizationId: ORG_ACME,
			playbookText: ACME_PLAYBOOK_TEXT,
			compiledAt: new Date(),
			compiledHash: acmePlaybookHash
		}
	});
	// Replace existing rules so the seed is the single source of truth (avoids
	// stacking duplicates next to LLM-compiled rules a dev may already have).
	await prisma.pricingRule.deleteMany({ where: { pricingPlaybookId: acmePlaybook.id } });
	for (const rule of acmePricingRules) {
		await prisma.pricingRule.create({
			data: {
				id: rule.id,
				pricingPlaybookId: acmePlaybook.id,
				ruleType: rule.ruleType,
				condition: rule.condition,
				effect: rule.effect,
				priority: 100,
				active: true,
				description: rule.description,
				conditionNarrative: null,
				manualOverride: false
			}
		});
	}

	console.log('\nOrganizations:');
	for (const org of orgs) {
		const count = memberships.filter(m => m.orgId === org.id).length;
		console.log(`  ${org.name} (${org.id}) — ${count} member(s)`);
	}

	console.log('\nUsers:');
	for (const user of users) {
		const orgsForUser = memberships
			.filter(m => m.email === user.email)
			.map(m => orgs.find(o => o.id === m.orgId)?.name);
		console.log(`  ${user.email} — current: ${orgsForUser[0]}, all: ${orgsForUser.join(', ')}`);
	}

	console.log('\nOpportunities:');
	for (const org of orgs) {
		const count = opportunities.filter(o => o.organizationId === org.id).length;
		console.log(`  ${org.name} — ${count} opportunit${count === 1 ? 'y' : 'ies'}`);
	}
	console.log(`  Total: ${opportunities.length}`);

	console.log('\nCatalog items:');
	for (const org of orgs) {
		const count = catalogItems.filter(c => c.organizationId === org.id).length;
		console.log(`  ${org.name} — ${count} item${count === 1 ? '' : 's'}`);
	}
	console.log(`  Total: ${catalogItems.length}`);
}

main()
	.catch(async error => {
		console.error(error);
		await prisma.$disconnect();
		process.exit(1);
	})
	.then(async () => {
		await prisma.$disconnect();
	});
