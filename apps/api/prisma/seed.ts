import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

config({ path: resolve(__dirname, '../.env') });

import type { CatalogItemUnit } from '@offertum/shared';
import { createHash } from 'node:crypto';
import {
	DismissReason,
	EmailProvider,
	ExpiryActionKind,
	ExpiryActionStatus,
	LogLevel,
	MembershipRole,
	NotificationEventType,
	OpportunityStatus,
	type Prisma,
	PricingRuleType,
	PrismaClient,
	QuoteDraftStatus,
	QuoteLineSource,
	ReplyDraftKind,
	ReplyDraftStatus,
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
// Second ACME mailbox, connected by Jeroen. Lets the "Mijn mailbox" (owner=mine) list
// filter be exercised — opps land on different inboxes within the same org.
const SEED_EMAIL_ACCOUNT_ACME_2 = '11111111-1111-1111-1111-000000000003';

const emailAccounts = [
	{
		id: SEED_EMAIL_ACCOUNT_ACME,
		organizationId: ORG_ACME,
		ownerEmail: 'selami1992@gmail.com',
		mailboxEmail: 'inbox+seed@acme-installaties.nl'
	},
	{
		id: SEED_EMAIL_ACCOUNT_ACME_2,
		organizationId: ORG_ACME,
		ownerEmail: 'jeroen@offertum.dev',
		mailboxEmail: 'jeroen+seed@acme-installaties.nl'
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
	// ── Optional scenario specs (W4–W13). Curated + synthetic opps leave these unset;
	// the `scenarioOpportunities` below set them so every feature has live seed data.
	/** Email of the user to assign to. `null` = unassigned. Omitted = the mailbox owner. */
	assignedToEmail?: string | null;
	/** Soft-dismiss the opp (sets dismissedAt/dismissReason/dismissedById). */
	dismiss?: SeedDismiss;
	/** Reply drafts (1:N), oldest-first. The last entry is the "current" draft. */
	drafts?: SeedReplyDraft[];
	/** A generated quote draft + its line items + optional PDF version(s). */
	quote?: SeedQuote;
	/** Smart-expiry suggestion (W13) on a sent quote. */
	expiryAction?: SeedExpiryAction;
	/** Extra thread messages (customer replies + own-org outbound), oldest-first. */
	threadMessages?: SeedThreadMessage[];
	/** In-app notifications surfaced in the bell. */
	notifications?: SeedNotification[];
	/** Extra timeline audit-log rows beyond the always-written received_via_mailbox. */
	timeline?: SeedTimelineLog[];
}

interface SeedDismiss {
	reason: DismissReason;
	byEmail: string;
	daysAgo: number;
}

interface SeedAttachment {
	filename: string;
	contentType: string;
	sizeBytes: number;
	/** When true, this attachment is the generated quote PDF (links to the opp's QuotePdf). */
	isQuotePdf?: boolean;
}

interface SeedReplyDraft {
	body: string;
	status: ReplyDraftStatus;
	createdDaysAgo: number;
	kind?: ReplyDraftKind;
	wasEditedByUser?: boolean;
	/** Sets sentAt when the draft is SENT. */
	sentDaysAgo?: number;
	attachments?: SeedAttachment[];
}

interface SeedQuoteLine {
	description: string;
	unit: string;
	quantity: number;
	unitPriceEur: number | null;
	source: QuoteLineSource;
	vatRate?: number;
	vatReverseCharged?: boolean;
	note?: string | null;
}

interface SeedQuote {
	status: QuoteDraftStatus;
	lines: SeedQuoteLine[];
	sentDaysAgo?: number;
	validUntilDaysFromNow?: number;
	/** Generated PDF filenames (one QuotePdf row each), newest last. */
	pdfFilenames?: string[];
}

interface SeedExpiryAction {
	status: ExpiryActionStatus;
	recommendedAction: ExpiryActionKind;
	suggestedCopy: string;
	takenAction?: ExpiryActionKind;
	takenByEmail?: string;
	validUntilDaysFromNow: number;
}

interface SeedThreadMessage {
	fromCustomer: boolean;
	fromName: string;
	fromEmail: string;
	bodyText: string;
	daysAgo: number;
	wasDetectedAsCloser?: boolean;
}

interface SeedNotification {
	eventType: NotificationEventType;
	title: string;
	body: string;
	daysAgo: number;
	read?: boolean;
}

interface SeedTimelineLog {
	action: string;
	daysAgo: number;
	actorEmail?: string;
	extra?: Record<string, unknown>;
}

// Ten hand-curated opportunities spanning both seed orgs, every status, urgency mix,
// and realistic Dutch SMB scenarios (installateur, bouwbedrijf, schilder, etc.).
// Fixed IDs so re-running the seed upserts in place — no duplicates on every run.
// `buildSyntheticOpportunities` below pads the set out to 100 total for list/paging
// /filter/sort testing; the combined `opportunities` array is what `main()` inserts.
const curatedOpportunities: ReadonlyArray<SeedOpportunity> = [
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

// ── Synthetic opportunity generator ──────────────────────────────────────────────
// Pads the curated set out to 100 total so the list page's paging, filtering, and
// sorting have realistic volume. Deterministic: index N → fixed UUIDs, so re-running
// `pnpm db:seed` upserts in place rather than stacking duplicates. No randomness.

const SYNTHETIC_CITIES: ReadonlyArray<readonly [string, string]> = [
	['Amersfoort', '3811 EN'],
	['Amsterdam', '1011 AB'],
	['Utrecht', '3511 LN'],
	['Rotterdam', '3011 AD'],
	['Den Haag', '2511 CV'],
	['Eindhoven', '5611 EM'],
	['Groningen', '9711 LM'],
	['Haarlem', '2011 CD'],
	['Nijmegen', '6511 AA'],
	['Tilburg', '5011 DL'],
	['Breda', '4811 HV'],
	['Zwolle', '8011 CW'],
	['Apeldoorn', '7311 GP'],
	['Arnhem', '6811 CG'],
	['Almere', '1315 HR']
];

const SYNTHETIC_STREETS = [
	'Hoofdstraat',
	'Kerkstraat',
	'Dorpsstraat',
	'Molenweg',
	'Schoolstraat',
	'Stationsweg',
	'Industrieweg',
	'Beukenlaan',
	'Wilgenhof',
	'Parklaan'
] as const;

const SYNTHETIC_FIRST_NAMES = [
	'Jan',
	'Eva',
	'Tom',
	'Sanne',
	'Daan',
	'Lisa',
	'Mark',
	'Anouk',
	'Peter',
	'Femke',
	'Ruud',
	'Karin',
	'Hugo',
	'Inge',
	'Bas',
	'Noor',
	'Joost',
	'Mirjam',
	'Wim',
	'Saar'
] as const;

const SYNTHETIC_LAST_NAMES = [
	'Bakker',
	'de Jong',
	'Visser',
	'Smit',
	'Meijer',
	'de Boer',
	'Mulder',
	'Bos',
	'Vos',
	'Peters',
	'Hendriks',
	'van Dijk',
	'van den Berg',
	'Jacobs',
	'Willems',
	'Kuiper',
	'Post',
	'Dekker',
	'Brouwer',
	'van Leeuwen'
] as const;

const SYNTHETIC_REQUEST_TYPES: ReadonlyArray<{ type: string; summary: string; hints: string[] }> = [
	{
		type: 'CV-ketel onderhoud',
		summary: 'het jaarlijkse onderhoud van onze CV-ketel',
		hints: ['CV-ketel', 'jaarlijks onderhoud']
	},
	{
		type: 'Badkamer renovatie',
		summary: 'een complete renovatie van onze badkamer',
		hints: ['badkamer', 'tegelwerk', 'sanitair']
	},
	{
		type: 'Dakkapel plaatsen',
		summary: 'het plaatsen van een dakkapel op de zolderverdieping',
		hints: ['dakkapel', 'zolder']
	},
	{
		type: 'Zonnepanelen installatie',
		summary: 'het installeren van zonnepanelen op ons schuine dak',
		hints: ['zonnepanelen', 'omvormer', 'schuin dak']
	},
	{
		type: 'Schilderwerk buitenkant',
		summary: 'het schilderen van de kozijnen en de voorgevel',
		hints: ['buitenschilderwerk', 'kozijnen', 'voorgevel']
	},
	{
		type: 'Warmtepomp advies',
		summary: 'advies en een offerte voor een hybride warmtepomp',
		hints: ['warmtepomp', 'hybride', 'verduurzaming']
	},
	{
		type: 'Keuken plaatsen',
		summary: 'het plaatsen en aansluiten van een nieuwe keuken',
		hints: ['keuken', 'montage', 'aansluiten']
	},
	{
		type: 'Elektra uitbreiding',
		summary: 'het uitbreiden van de groepenkast met extra groepen',
		hints: ['groepenkast', 'elektra', 'extra groepen']
	},
	{
		type: 'Vloerverwarming aanleggen',
		summary: 'het aanleggen van vloerverwarming in de woonkamer',
		hints: ['vloerverwarming', 'woonkamer']
	},
	{
		type: 'Dakgoot vervanging',
		summary: 'het vervangen van de dakgoten rondom de woning',
		hints: ['dakgoot', 'hemelwaterafvoer']
	},
	{
		type: 'Isolatie spouwmuur',
		summary: 'het isoleren van de spouwmuren van onze jaren-70 woning',
		hints: ['spouwmuurisolatie', 'verduurzaming']
	},
	{
		type: 'Airco installatie',
		summary: 'het laten installeren van een airco in de slaapkamer',
		hints: ['airco', 'split-unit', 'slaapkamer']
	}
];

const SYNTHETIC_STATUSES: ReadonlyArray<OpportunityStatus> = [
	OpportunityStatus.NEW,
	OpportunityStatus.NEW,
	OpportunityStatus.REPLIED,
	OpportunityStatus.WAITING,
	OpportunityStatus.WON,
	OpportunityStatus.COLD,
	OpportunityStatus.LOST
];

const SYNTHETIC_URGENCIES: ReadonlyArray<Urgency> = [
	Urgency.NORMAL,
	Urgency.LOW,
	Urgency.HIGH,
	Urgency.NORMAL,
	Urgency.EMERGENCY
];

function pad(value: number, length: number): string {
	return String(value).padStart(length, '0');
}

function slugifyEmailLocal(first: string, last: string): string {
	return `${first}.${last}`.toLowerCase().replace(/\s+/g, '');
}

// Deterministic UUID for a related entity (draft, quote, pdf, …) so re-seeding upserts in
// place. `prefix8` (8 hex chars) namespaces the entity type; `oppNum` + `sub` make it unique.
function entityId(prefix8: string, oppNum: number, sub: number): string {
	return `${prefix8}-${pad(oppNum, 4)}-${pad(sub, 4)}-0000-${pad(oppNum, 8)}${pad(sub, 4)}`;
}

// Builds opportunities numbered `start+1 .. total` (1-based) so their IDs never collide
// with the curated entries (which occupy 1..curated.length).
function buildSyntheticOpportunities(start: number, total: number): SeedOpportunity[] {
	const result: SeedOpportunity[] = [];

	for (let n = start + 1; n <= total; n++) {
		const i = n - 1; // 0-based index for cycling the pools
		const isAcme = i % 2 === 0;
		const organizationId = isAcme ? ORG_ACME : ORG_BOUW;
		const emailAccountId = isAcme ? SEED_EMAIL_ACCOUNT_ACME : SEED_EMAIL_ACCOUNT_BOUW;

		const firstName = SYNTHETIC_FIRST_NAMES[i % SYNTHETIC_FIRST_NAMES.length];
		const lastName = SYNTHETIC_LAST_NAMES[(i * 3) % SYNTHETIC_LAST_NAMES.length];
		const fullName = `${firstName} ${lastName}`;
		const email = `${slugifyEmailLocal(firstName, lastName)}@example.nl`;

		const [city, postcode] = SYNTHETIC_CITIES[i % SYNTHETIC_CITIES.length];
		const street = SYNTHETIC_STREETS[(i * 7) % SYNTHETIC_STREETS.length];
		const houseNumber = ((i * 13) % 120) + 1;
		const address = `${street} ${houseNumber}, ${postcode} ${city}`;

		const request = SYNTHETIC_REQUEST_TYPES[i % SYNTHETIC_REQUEST_TYPES.length];
		const status = SYNTHETIC_STATUSES[i % SYNTHETIC_STATUSES.length];
		const urgency = SYNTHETIC_URGENCIES[i % SYNTHETIC_URGENCIES.length];

		// Spread arrival over the last ~120 days; deadlines/appointments vary, some null.
		const internalDateDaysAgo = (i * 5) % 120;
		const deadlineDaysFromNow = i % 4 === 0 ? null : ((i * 11) % 40) + 5;
		const appointmentDaysFromNow = i % 3 === 0 ? ((i * 7) % 20) + 2 : null;

		const subject = `Offerteaanvraag: ${request.type}`;
		const bodyText = [
			'Geachte heer/mevrouw,',
			'',
			`Wij zijn op zoek naar een vakman voor ${request.summary}. De woning bevindt zich op ${address}.`,
			'',
			'Zou u ons een vrijblijvende offerte kunnen sturen? Een afspraak voor opname ter plaatse is bespreekbaar.',
			'',
			'Met vriendelijke groet,',
			fullName,
			address
		].join('\n');

		result.push({
			rawMessageId: `22222222-${pad(n, 4)}-0000-0000-${pad(n, 12)}`,
			opportunityId: `33333333-${pad(n, 4)}-0000-0000-${pad(n, 12)}`,
			organizationId,
			emailAccountId,
			subject,
			fromEmail: email,
			fromName: fullName,
			bodyText,
			customerName: fullName,
			customerEmail: email,
			address,
			requestType: request.type,
			urgency,
			status,
			classifierConfidence: 0.8 + (i % 20) / 100,
			classifierReason: 'Synthetische seed-opportunity voor list/paging-tests.',
			deliverableHints: request.hints,
			internalDateDaysAgo,
			deadlineDaysFromNow,
			appointmentDaysFromNow
		});
	}

	return result;
}

const SEED_OPPORTUNITY_TOTAL = 100;

// ── Scenario opportunities (101+) ────────────────────────────────────────────────
// One opportunity per distinct feature/scenario so a fresh DB exercises EVERY surface:
// every status, draft state + kind, multiple drafts, customer replies/threads, closers,
// quotes (draft/sent), line-item sources, quote PDFs + history, attachments, smart-expiry
// actions, dismiss reasons, assignment, mailbox-owner filter, urgency/deadline variants,
// notifications, and timeline events. Each declares its related rows via the optional
// scenario specs on SeedOpportunity; `main()` materializes them.

// Compact builder: fills the boilerplate base fields, leaving the scenario specs to `extra`.
function scenario(
	num: number,
	requestType: string,
	customerName: string,
	extra: Partial<SeedOpportunity> = {}
): SeedOpportunity {
	const slug = customerName
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '.')
		.replace(/(^\.|\.$)/g, '');
	const email = `${slug}@example.nl`;
	return {
		rawMessageId: `22222222-${pad(num, 4)}-0000-0000-${pad(num, 12)}`,
		opportunityId: `33333333-${pad(num, 4)}-0000-0000-${pad(num, 12)}`,
		organizationId: ORG_ACME,
		emailAccountId: SEED_EMAIL_ACCOUNT_ACME,
		subject: `Offerteaanvraag: ${requestType}`,
		fromEmail: email,
		fromName: customerName,
		bodyText: [
			'Goedendag,',
			'',
			`Ik zou graag een offerte ontvangen voor ${requestType.toLowerCase()}. Kunt u laten weten wat de mogelijkheden en de kosten zijn?`,
			'',
			'Met vriendelijke groet,',
			customerName
		].join('\n'),
		customerName,
		customerEmail: email,
		address: 'Voorbeeldstraat 1, 1234 AB Utrecht',
		requestType,
		urgency: Urgency.NORMAL,
		status: OpportunityStatus.NEW,
		classifierConfidence: 0.92,
		classifierReason: 'Seed scenario-opportunity met live gerelateerde data.',
		deliverableHints: [requestType],
		internalDateDaysAgo: 3,
		deadlineDaysFromNow: null,
		appointmentDaysFromNow: null,
		...extra
	};
}

const SENT_REPLY_BODY = [
	'Beste klant,',
	'',
	'Bedankt voor uw aanvraag. Hierbij ontvangt u onze reactie; we denken graag met u mee.',
	'',
	'Met vriendelijke groet,',
	'Acme Installaties'
].join('\n');

const scenarioOpportunities: ReadonlyArray<SeedOpportunity> = [
	// 101 — NEW, AI draft pending review ("Bekijk concept")
	scenario(101, 'CV-ketel vervangen', 'Lotte Hendriks', {
		drafts: [{ body: SENT_REPLY_BODY, status: ReplyDraftStatus.PENDING_APPROVAL, createdDaysAgo: 2 }],
		notifications: [
			{
				eventType: NotificationEventType.OPPORTUNITY_CREATED,
				title: 'Nieuwe offerteaanvraag',
				body: 'CV-ketel vervangen — Lotte Hendriks',
				daysAgo: 2
			}
		]
	}),
	// 102 — NEW, draft edited by the owner (EDITED, wasEditedByUser)
	scenario(102, 'Badkamer verbouwen', 'Youssef El Amrani', {
		drafts: [
			{
				body: `${SENT_REPLY_BODY}\n\nP.S. We kunnen volgende week al langskomen voor een opname.`,
				status: ReplyDraftStatus.EDITED,
				wasEditedByUser: true,
				createdDaysAgo: 2
			}
		]
	}),
	// 103 — REPLIED, single sent reply
	scenario(103, 'Dakgoot vervangen', 'Marloes Visser', {
		status: OpportunityStatus.REPLIED,
		drafts: [{ body: SENT_REPLY_BODY, status: ReplyDraftStatus.SENT, createdDaysAgo: 4, sentDaysAgo: 4 }]
	}),
	// 104 — Multiple drafts: a SENT reply + a newer PENDING follow-up (history panel + 1:N "current")
	scenario(104, 'Zonnepanelen uitbreiden', 'Tim Bakker', {
		status: OpportunityStatus.REPLIED,
		drafts: [
			{ body: SENT_REPLY_BODY, status: ReplyDraftStatus.SENT, createdDaysAgo: 6, sentDaysAgo: 6 },
			{
				body: 'Beste Tim, een korte aanvulling op onze vorige mail…',
				status: ReplyDraftStatus.PENDING_APPROVAL,
				createdDaysAgo: 1
			}
		]
	}),
	// 105 — Customer reply landed (status flipped back to NEW), fresh follow-up draft pending
	scenario(105, 'Vloerverwarming aanleggen', 'Sofie Janssen', {
		status: OpportunityStatus.NEW,
		threadMessages: [
			{
				fromCustomer: false,
				fromName: 'Acme Installaties',
				fromEmail: 'inbox+seed@acme-installaties.nl',
				bodyText: SENT_REPLY_BODY,
				daysAgo: 5
			},
			{
				fromCustomer: true,
				fromName: 'Sofie Janssen',
				fromEmail: 'sofie.janssen@example.nl',
				bodyText: 'Dank! Kunnen jullie ook de oude vloer verwijderen? En wat is de levertijd?',
				daysAgo: 1
			}
		],
		drafts: [
			{ body: SENT_REPLY_BODY, status: ReplyDraftStatus.SENT, createdDaysAgo: 5, sentDaysAgo: 5 },
			{
				body: 'Beste Sofie, jazeker — we kunnen de oude vloer meenemen. De levertijd is 2 weken…',
				status: ReplyDraftStatus.PENDING_APPROVAL,
				createdDaysAgo: 1
			}
		],
		notifications: [
			{
				eventType: NotificationEventType.CUSTOMER_REPLY,
				title: 'Nieuw antwoord van klant',
				body: 'Sofie Janssen reageerde op je offerte',
				daysAgo: 1
			}
		]
	}),
	// 106 — Thread with a conversation-closer reply ("Bedankt, tot dan!"), deal won
	scenario(106, 'Keuken plaatsen', 'Daan Mulder', {
		status: OpportunityStatus.WON,
		threadMessages: [
			{
				fromCustomer: false,
				fromName: 'Acme Installaties',
				fromEmail: 'inbox+seed@acme-installaties.nl',
				bodyText: SENT_REPLY_BODY,
				daysAgo: 7
			},
			{
				fromCustomer: true,
				fromName: 'Daan Mulder',
				fromEmail: 'daan.mulder@example.nl',
				bodyText: 'Top, akkoord met de offerte. Bedankt, tot dan!',
				daysAgo: 3,
				wasDetectedAsCloser: true
			}
		],
		drafts: [{ body: SENT_REPLY_BODY, status: ReplyDraftStatus.SENT, createdDaysAgo: 7, sentDaysAgo: 7 }]
	}),
	// 107 — Pending automatic check-in ("Follow-up wacht") on a replied opp
	scenario(107, 'Schilderwerk buiten', 'Anouk de Wit', {
		status: OpportunityStatus.REPLIED,
		drafts: [
			{ body: SENT_REPLY_BODY, status: ReplyDraftStatus.SENT, createdDaysAgo: 12, sentDaysAgo: 12 },
			{
				body: 'Beste Anouk, ik wilde even checken of u nog vragen had over onze offerte?',
				status: ReplyDraftStatus.PENDING_APPROVAL,
				kind: ReplyDraftKind.CHECK_IN,
				createdDaysAgo: 0
			}
		]
	}),
	// 108 — Already-sent automatic check-in in the history
	scenario(108, 'Spouwmuur isoleren', 'Bram Visser', {
		status: OpportunityStatus.REPLIED,
		drafts: [
			{ body: SENT_REPLY_BODY, status: ReplyDraftStatus.SENT, createdDaysAgo: 20, sentDaysAgo: 20 },
			{
				body: 'Beste Bram, een korte herinnering aan onze offerte van vorige week.',
				status: ReplyDraftStatus.SENT,
				kind: ReplyDraftKind.CHECK_IN,
				createdDaysAgo: 6,
				sentDaysAgo: 6
			}
		]
	}),
	// 109 — WAITING on the customer, reply already sent
	scenario(109, 'Airco installeren', 'Nina Smit', {
		status: OpportunityStatus.WAITING,
		drafts: [{ body: SENT_REPLY_BODY, status: ReplyDraftStatus.SENT, createdDaysAgo: 8, sentDaysAgo: 8 }]
	}),
	// 110 — Auto-cold: scheduler flipped REPLIED → COLD; timeline + notification
	scenario(110, 'Dakkapel plaatsen', 'Ruben Post', {
		status: OpportunityStatus.COLD,
		internalDateDaysAgo: 40,
		drafts: [{ body: SENT_REPLY_BODY, status: ReplyDraftStatus.SENT, createdDaysAgo: 35, sentDaysAgo: 35 }],
		timeline: [{ action: 'opportunity.auto_cold.flipped', daysAgo: 5 }],
		notifications: [
			{
				eventType: NotificationEventType.OPPORTUNITY_AUTO_COLD,
				title: 'Offerteaanvraag op stil gezet',
				body: 'Geen reactie meer van Ruben Post',
				daysAgo: 5,
				read: true
			}
		]
	}),
	// 111 — WON with a sent quote + PDF attached to the sent reply
	scenario(111, 'Complete badkamer renovatie', 'Familie Van Dijk', {
		status: OpportunityStatus.WON,
		internalDateDaysAgo: 18,
		quote: {
			status: QuoteDraftStatus.SENT,
			sentDaysAgo: 14,
			validUntilDaysFromNow: 16,
			pdfFilenames: ['offerte-badkamer-vandijk.pdf'],
			lines: [
				{
					description: 'Tegelwerk badkamer',
					unit: 'square_meter',
					quantity: 18,
					unitPriceEur: 65,
					source: QuoteLineSource.CATALOG_MATCH
				},
				{
					description: 'Loodgieterswerk',
					unit: 'hour',
					quantity: 16,
					unitPriceEur: 55,
					source: QuoteLineSource.RULE_APPLIED,
					note: 'Uurtarief installateur'
				},
				{
					description: 'Sanitair (douche + wastafel)',
					unit: 'flat_fee',
					quantity: 1,
					unitPriceEur: 1850,
					source: QuoteLineSource.CATALOG_MATCH
				}
			]
		},
		drafts: [
			{
				body: `${SENT_REPLY_BODY}\n\nIn de bijlage vindt u onze offerte.`,
				status: ReplyDraftStatus.SENT,
				createdDaysAgo: 14,
				sentDaysAgo: 14,
				attachments: [
					{
						filename: 'offerte-badkamer-vandijk.pdf',
						contentType: 'application/pdf',
						sizeBytes: 52000,
						isQuotePdf: true
					}
				]
			}
		]
	}),
	// 112 — LOST deal
	scenario(112, 'Tuinhuis bouwen', 'Kees Brouwer', {
		status: OpportunityStatus.LOST,
		internalDateDaysAgo: 25,
		drafts: [{ body: SENT_REPLY_BODY, status: ReplyDraftStatus.SENT, createdDaysAgo: 22, sentDaysAgo: 22 }]
	}),
	// 113-116 — Dismissed (all four reasons)
	scenario(113, 'Nieuwsbrief aanmelding', 'Marketing Bureau X', {
		dismiss: { reason: DismissReason.NOT_A_QUOTE, byEmail: 'selami1992@gmail.com', daysAgo: 2 }
	}),
	scenario(114, 'CV-ketel vervangen (dubbel)', 'Lotte Hendriks', {
		dismiss: { reason: DismissReason.DUPLICATE, byEmail: 'selami1992@gmail.com', daysAgo: 1 }
	}),
	scenario(115, 'Win een gratis iPhone', 'Promo Mailer', {
		dismiss: { reason: DismissReason.SPAM, byEmail: 'selami1992@gmail.com', daysAgo: 3 }
	}),
	scenario(116, 'Onduidelijke aanvraag', 'Anoniem', {
		dismiss: { reason: DismissReason.OTHER, byEmail: 'jeroen@offertum.dev', daysAgo: 4 }
	}),
	// 117 — Quote DRAFT with every line-item source + reverse-charge + inferred-null-price + VAT variants
	scenario(117, 'Verbouwing zolder', 'Hugo Peters', {
		status: OpportunityStatus.REPLIED,
		quote: {
			status: QuoteDraftStatus.DRAFT,
			validUntilDaysFromNow: 30,
			lines: [
				{
					description: 'Dakraam Velux',
					unit: 'flat_fee',
					quantity: 2,
					unitPriceEur: 480,
					source: QuoteLineSource.CATALOG_MATCH,
					vatRate: 21
				},
				{
					description: 'Timmerwerk',
					unit: 'hour',
					quantity: 24,
					unitPriceEur: 52,
					source: QuoteLineSource.RULE_APPLIED,
					note: 'Uurtarief timmerman'
				},
				{
					description: 'Onderaanneming elektra (BTW verlegd)',
					unit: 'flat_fee',
					quantity: 1,
					unitPriceEur: 900,
					source: QuoteLineSource.RULE_APPLIED,
					vatReverseCharged: true,
					note: 'BTW verlegd naar opdrachtgever'
				},
				{
					description: 'Isolatiemateriaal (laag tarief)',
					unit: 'square_meter',
					quantity: 30,
					unitPriceEur: 18,
					source: QuoteLineSource.CATALOG_MATCH,
					vatRate: 9
				},
				{
					description: 'Maatwerk inbouwkast',
					unit: 'flat_fee',
					quantity: 1,
					unitPriceEur: null,
					source: QuoteLineSource.INFERRED,
					note: 'Prijs nog in te stellen'
				}
			]
		}
	}),
	// 118 — Quote SENT + smart-expiry SUGGESTED (extend), reply with attached PDF
	scenario(118, 'Cv-installatie nieuwbouw', 'Sander Vermeer', {
		status: OpportunityStatus.REPLIED,
		internalDateDaysAgo: 22,
		quote: {
			status: QuoteDraftStatus.SENT,
			sentDaysAgo: 20,
			validUntilDaysFromNow: 4,
			pdfFilenames: ['offerte-cv-vermeer.pdf'],
			lines: [
				{
					description: 'CV-ketel Remeha',
					unit: 'flat_fee',
					quantity: 1,
					unitPriceEur: 2200,
					source: QuoteLineSource.CATALOG_MATCH
				},
				{
					description: 'Installatie + inregelen',
					unit: 'hour',
					quantity: 12,
					unitPriceEur: 55,
					source: QuoteLineSource.RULE_APPLIED
				}
			]
		},
		drafts: [
			{
				body: `${SENT_REPLY_BODY}\n\nOnze offerte zit in de bijlage.`,
				status: ReplyDraftStatus.SENT,
				createdDaysAgo: 20,
				sentDaysAgo: 20,
				attachments: [
					{
						filename: 'offerte-cv-vermeer.pdf',
						contentType: 'application/pdf',
						sizeBytes: 49000,
						isQuotePdf: true
					}
				]
			}
		],
		expiryAction: {
			status: ExpiryActionStatus.SUGGESTED,
			recommendedAction: ExpiryActionKind.EXTEND_14D,
			suggestedCopy: 'Uw offerte verloopt binnenkort — zal ik de geldigheid met 14 dagen verlengen?',
			validUntilDaysFromNow: 4
		}
	}),
	// 119 — Quote with a PDF version history (two generated versions)
	scenario(119, 'Uitbouw keuken', 'Eva Willems', {
		status: OpportunityStatus.REPLIED,
		internalDateDaysAgo: 15,
		quote: {
			status: QuoteDraftStatus.SENT,
			sentDaysAgo: 10,
			validUntilDaysFromNow: 20,
			pdfFilenames: ['offerte-keuken-v1.pdf', 'offerte-keuken-v2.pdf'],
			lines: [
				{
					description: 'Uitbouw 12 m²',
					unit: 'square_meter',
					quantity: 12,
					unitPriceEur: 1450,
					source: QuoteLineSource.RULE_APPLIED
				},
				{
					description: 'Stelpost afwerking',
					unit: 'flat_fee',
					quantity: 1,
					unitPriceEur: null,
					source: QuoteLineSource.INFERRED,
					note: 'Stelpost — nader te bepalen'
				}
			]
		},
		drafts: [
			{
				body: `${SENT_REPLY_BODY}\n\nDe meest recente offerte vindt u in de bijlage.`,
				status: ReplyDraftStatus.SENT,
				createdDaysAgo: 10,
				sentDaysAgo: 10,
				attachments: [
					{
						filename: 'offerte-keuken-v2.pdf',
						contentType: 'application/pdf',
						sizeBytes: 51000,
						isQuotePdf: true
					}
				]
			}
		]
	}),
	// 120 — Owner-uploaded (non-PDF) attachment on a pending draft
	scenario(120, 'Lekkage opsporen', 'Pim Dekker', {
		drafts: [
			{
				body: `${SENT_REPLY_BODY}\n\nTer illustratie een foto van de situatie.`,
				status: ReplyDraftStatus.PENDING_APPROVAL,
				createdDaysAgo: 1,
				attachments: [{ filename: 'situatie-foto.jpg', contentType: 'image/jpeg', sizeBytes: 184000 }]
			}
		]
	}),
	// 121 — Smart-expiry SUGGESTED: last-followup recommendation
	scenario(121, 'Gevelreiniging', 'Iris Kuiper', {
		status: OpportunityStatus.REPLIED,
		internalDateDaysAgo: 24,
		quote: {
			status: QuoteDraftStatus.SENT,
			sentDaysAgo: 22,
			validUntilDaysFromNow: 3,
			pdfFilenames: ['offerte-gevel-kuiper.pdf'],
			lines: [
				{
					description: 'Gevelreiniging',
					unit: 'square_meter',
					quantity: 80,
					unitPriceEur: 12,
					source: QuoteLineSource.CATALOG_MATCH
				}
			]
		},
		expiryAction: {
			status: ExpiryActionStatus.SUGGESTED,
			recommendedAction: ExpiryActionKind.LAST_FOLLOWUP,
			suggestedCopy: 'Zal ik een laatste vriendelijke herinnering sturen voordat de offerte verloopt?',
			validUntilDaysFromNow: 3
		}
	}),
	// 122 — Smart-expiry TAKEN (extend applied)
	scenario(122, 'Schuur renoveren', 'Joost Linden', {
		status: OpportunityStatus.REPLIED,
		internalDateDaysAgo: 30,
		quote: {
			status: QuoteDraftStatus.SENT,
			sentDaysAgo: 28,
			validUntilDaysFromNow: 12,
			pdfFilenames: ['offerte-schuur-linden.pdf'],
			lines: [
				{
					description: 'Renovatie schuur',
					unit: 'flat_fee',
					quantity: 1,
					unitPriceEur: 4200,
					source: QuoteLineSource.RULE_APPLIED
				}
			]
		},
		expiryAction: {
			status: ExpiryActionStatus.TAKEN,
			recommendedAction: ExpiryActionKind.EXTEND_14D,
			takenAction: ExpiryActionKind.EXTEND_14D,
			takenByEmail: 'selami1992@gmail.com',
			suggestedCopy: 'Geldigheid verlengd met 14 dagen.',
			validUntilDaysFromNow: 12
		}
	}),
	// 123 — Smart-expiry DISMISSED (mark-lost waved off)
	scenario(123, 'Oprit bestraten', 'Mirjam Bos', {
		status: OpportunityStatus.REPLIED,
		internalDateDaysAgo: 35,
		quote: {
			status: QuoteDraftStatus.SENT,
			sentDaysAgo: 33,
			validUntilDaysFromNow: -2,
			pdfFilenames: ['offerte-oprit-bos.pdf'],
			lines: [
				{
					description: 'Bestrating oprit',
					unit: 'square_meter',
					quantity: 45,
					unitPriceEur: 38,
					source: QuoteLineSource.CATALOG_MATCH
				}
			]
		},
		expiryAction: {
			status: ExpiryActionStatus.DISMISSED,
			recommendedAction: ExpiryActionKind.MARK_LOST,
			suggestedCopy: 'De offerte is verlopen — markeren als verloren?',
			validUntilDaysFromNow: -2
		}
	}),
	// 124 — Manually assigned to a teammate (Jeroen) + timeline "Toewijzing"
	scenario(124, 'Cv-onderhoud jaarcontract', 'Wim Jacobs', {
		assignedToEmail: 'jeroen@offertum.dev',
		timeline: [
			{
				action: 'opportunity.assigned',
				daysAgo: 1,
				actorEmail: 'selami1992@gmail.com',
				extra: { assignedToUserName: 'Jeroen Bakker' }
			}
		]
	}),
	// 125 — Unassigned (no one picked it up yet)
	scenario(125, 'Kozijnen vervangen', 'Saar Hofman', { assignedToEmail: null }),
	// 126 — Lands on Jeroen's mailbox (drives the owner=mine list filter)
	scenario(126, 'Radiatoren vervangen', 'Bas Koster', {
		emailAccountId: SEED_EMAIL_ACCOUNT_ACME_2
	}),
	// 127 — EMERGENCY urgency with imminent deadline + appointment tomorrow
	scenario(127, 'Acute lekkage CV', 'Femke Dijkstra', {
		urgency: Urgency.EMERGENCY,
		internalDateDaysAgo: 0,
		deadlineDaysFromNow: 1,
		appointmentDaysFromNow: 1
	}),
	// 128 — LOW urgency, no deadline
	scenario(128, 'Oriënterend gesprek verbouwing', 'Karel Mol', { urgency: Urgency.LOW }),
	// 129 — Notifications showcase (created + daily digest), with deadline
	scenario(129, 'Warmtepomp advies', 'Lieke Vos', {
		deadlineDaysFromNow: 10,
		notifications: [
			{
				eventType: NotificationEventType.OPPORTUNITY_CREATED,
				title: 'Nieuwe offerteaanvraag',
				body: 'Warmtepomp advies — Lieke Vos',
				daysAgo: 1
			},
			{
				eventType: NotificationEventType.DAILY_DIGEST,
				title: 'Je dagelijkse overzicht',
				body: '3 open aanvragen, 1 verloopt binnenkort',
				daysAgo: 0
			}
		]
	}),
	// 130 — Full lifecycle showcase: thread + replies + multiple drafts + sent quote + PDF + expiry taken, WON
	scenario(130, 'Complete woninginstallatie', 'Project Zonneveld BV', {
		status: OpportunityStatus.WON,
		internalDateDaysAgo: 30,
		urgency: Urgency.HIGH,
		deadlineDaysFromNow: 5,
		appointmentDaysFromNow: 2,
		threadMessages: [
			{
				fromCustomer: false,
				fromName: 'Acme Installaties',
				fromEmail: 'inbox+seed@acme-installaties.nl',
				bodyText: SENT_REPLY_BODY,
				daysAgo: 26
			},
			{
				fromCustomer: true,
				fromName: 'Project Zonneveld BV',
				fromEmail: 'project.zonneveld.bv@example.nl',
				bodyText: 'Bedankt, kunnen we de planning bespreken?',
				daysAgo: 20
			},
			{
				fromCustomer: false,
				fromName: 'Acme Installaties',
				fromEmail: 'inbox+seed@acme-installaties.nl',
				bodyText: 'Zeker, voorstel in de bijlage.',
				daysAgo: 18
			},
			{
				fromCustomer: true,
				fromName: 'Project Zonneveld BV',
				fromEmail: 'project.zonneveld.bv@example.nl',
				bodyText: 'Akkoord, we gaan ervoor!',
				daysAgo: 12,
				wasDetectedAsCloser: true
			}
		],
		quote: {
			status: QuoteDraftStatus.SENT,
			sentDaysAgo: 18,
			validUntilDaysFromNow: 20,
			pdfFilenames: ['offerte-zonneveld-v1.pdf', 'offerte-zonneveld-v2.pdf'],
			lines: [
				{
					description: 'Complete CV-installatie',
					unit: 'flat_fee',
					quantity: 1,
					unitPriceEur: 8400,
					source: QuoteLineSource.RULE_APPLIED
				},
				{
					description: 'Zonnepanelen (12 stuks)',
					unit: 'flat_fee',
					quantity: 1,
					unitPriceEur: 5600,
					source: QuoteLineSource.CATALOG_MATCH
				},
				{
					description: 'Meerwerk in overleg',
					unit: 'flat_fee',
					quantity: 1,
					unitPriceEur: null,
					source: QuoteLineSource.INFERRED,
					note: 'Stelpost'
				}
			]
		},
		drafts: [
			{ body: SENT_REPLY_BODY, status: ReplyDraftStatus.SENT, createdDaysAgo: 26, sentDaysAgo: 26 },
			{
				body: 'Beste, de definitieve offerte zit in de bijlage.',
				status: ReplyDraftStatus.SENT,
				createdDaysAgo: 18,
				sentDaysAgo: 18,
				attachments: [
					{
						filename: 'offerte-zonneveld-v2.pdf',
						contentType: 'application/pdf',
						sizeBytes: 64000,
						isQuotePdf: true
					}
				]
			}
		],
		expiryAction: {
			status: ExpiryActionStatus.TAKEN,
			recommendedAction: ExpiryActionKind.LAST_FOLLOWUP,
			takenAction: ExpiryActionKind.LAST_FOLLOWUP,
			takenByEmail: 'selami1992@gmail.com',
			suggestedCopy: 'Laatste herinnering verstuurd.',
			validUntilDaysFromNow: 20
		},
		timeline: [
			{
				action: 'opportunity.status.updated',
				daysAgo: 12,
				actorEmail: 'selami1992@gmail.com',
				extra: { from: 'replied', to: 'won' }
			},
			{
				action: 'opportunity.assigned',
				daysAgo: 25,
				actorEmail: 'selami1992@gmail.com',
				extra: { assignedToUserName: 'Selami C' }
			}
		]
	})
];

// Curated entries first (stable), synthetic fillers to 100, then the scenario opps (101+).
const opportunities: ReadonlyArray<SeedOpportunity> = [
	...curatedOpportunities,
	...buildSyntheticOpportunities(curatedOpportunities.length, SEED_OPPORTUNITY_TOTAL),
	...scenarioOpportunities
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

// ── Dummy attachment blobs ──────────────────────────────────────────────────
// The QuotePdf / ReplyDraftAttachment rows below reference files in the local
// AttachmentStorage. Seeding only the rows leaves every download/preview 404-ing,
// so we also write a small valid dummy file (+ the `.contenttype` sidecar the
// local driver expects) at each storageKey. Mirrors LocalAttachmentStorage's path
// resolution (root = ATTACHMENT_STORAGE_LOCAL_DIR, anchored at apps/api) so the
// running API reads exactly what we write here.
const ATTACHMENT_ROOT = (() => {
	const configured = process.env.ATTACHMENT_STORAGE_LOCAL_DIR ?? '.attachments';
	return isAbsolute(configured) ? resolve(configured) : resolve(__dirname, '..', configured);
})();

function escapePdfText(text: string): string {
	return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// Minimal but valid single-page PDF (with a computed xref table) so the dummy
// actually opens in a viewer.
function dummyPdf(lines: string[]): Buffer {
	const content = lines
		.map((line, i) => `BT /F1 ${i === 0 ? 20 : 12} Tf 60 ${780 - i * 26} Td (${escapePdfText(line)}) Tj ET`)
		.join('\n');
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
		`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
	];
	let body = '%PDF-1.4\n';
	const offsets: number[] = [];
	for (let i = 0; i < objects.length; i++) {
		offsets.push(Buffer.byteLength(body));
		body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
	}
	const xrefStart = Buffer.byteLength(body);
	let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const off of offsets) {
		xref += `${String(off).padStart(10, '0')} 00000 n \n`;
	}
	const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
	return Buffer.from(body + xref + trailer, 'latin1');
}

// 1×1 placeholder images so non-PDF dummies open as real images.
const DUMMY_JPEG = Buffer.from(
	'/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==',
	'base64'
);
const DUMMY_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);

function dummyBytesFor(contentType: string, label: string): Buffer {
	if (contentType === 'application/pdf') {
		return dummyPdf(['Offertum — voorbeeldbijlage', label, '(dummy seed-bestand)']);
	}
	if (contentType === 'image/jpeg') {
		return DUMMY_JPEG;
	}
	if (contentType === 'image/png') {
		return DUMMY_PNG;
	}
	return Buffer.from(`Offertum dummy attachment\n${label}\n`, 'utf-8');
}

async function writeDummyAsset(storageKey: string, contentType: string, label: string): Promise<void> {
	const fullPath = resolve(ATTACHMENT_ROOT, storageKey);
	await mkdir(dirname(fullPath), { recursive: true });
	await writeFile(fullPath, dummyBytesFor(contentType, label));
	await writeFile(`${fullPath}.contenttype`, contentType, 'utf-8');
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

	// Email → {id, name} lookup, used to resolve mailbox owners, assignees, dismissers,
	// notification recipients and timeline actors when materializing scenario opps.
	const usersByEmail = new Map<string, { id: string; name: string | null }>();
	for (const user of users) {
		const u = await prisma.user.findUniqueOrThrow({ where: { email: user.email } });
		usersByEmail.set(user.email, { id: u.id, name: u.name });
	}
	const userId = (email: string): string => {
		const u = usersByEmail.get(email);
		if (!u) {
			throw new Error(`Seed misconfiguration: no user ${email}`);
		}
		return u.id;
	};

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
		const account = emailAccounts.find(a => a.id === opp.emailAccountId);
		if (!account) {
			throw new Error(
				`Seed misconfiguration: no email account ${opp.emailAccountId} for opp ${opp.opportunityId}`
			);
		}
		const mailboxOwner = usersByEmail.get(account.ownerEmail);
		if (!mailboxOwner) {
			throw new Error(`Seed misconfiguration: no user ${account.ownerEmail} for mailbox ${account.id}`);
		}
		// Assignee defaults to the mailbox owner; `null` = unassigned; a specific email overrides.
		const assigneeId =
			opp.assignedToEmail === null ? null : opp.assignedToEmail ? userId(opp.assignedToEmail) : mailboxOwner.id;
		const oppNum = parseInt(opp.opportunityId.slice(9, 13), 10);
		const dismissedAt = opp.dismiss ? daysAgo(opp.dismiss.daysAgo) : null;
		const dismissReason = opp.dismiss ? opp.dismiss.reason : null;
		const dismissedById = opp.dismiss ? userId(opp.dismiss.byEmail) : null;

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
				assignedToUserId: assigneeId,
				dismissedAt,
				dismissReason,
				dismissedById,
				// Backfill on re-seed too (originating = latest customer message). Thread
				// scenarios bump this forward to the newest reply in the thread block below.
				latestCustomerRawMessageId: opp.rawMessageId
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
				assignedToUserId: assigneeId,
				dismissedAt,
				dismissReason,
				dismissedById,
				// Mirror production: the originating message is the latest customer message at
				// creation. Thread scenarios bump this forward to the newest reply below.
				latestCustomerRawMessageId: opp.rawMessageId,
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
					mailboxOwnerUserId: mailboxOwner.id,
					mailboxOwnerName: mailboxOwner.name,
					originatingRawMessageId: opp.rawMessageId,
					originatingInternalDate: receivedAt.toISOString()
				}
			}
		});

		// ── Quote draft + line items + PDF version history ──
		let quoteDraftId: string | null = null;
		const pdfIds: string[] = [];
		if (opp.quote) {
			quoteDraftId = entityId('66666666', oppNum, 1);
			const q = opp.quote;
			await prisma.quoteDraft.upsert({
				where: { id: quoteDraftId },
				update: {},
				create: {
					id: quoteDraftId,
					organizationId: opp.organizationId,
					opportunityId: opp.opportunityId,
					status: q.status,
					generationContext: { seed: true, requestType: opp.requestType },
					sentAt: q.status === QuoteDraftStatus.SENT && q.sentDaysAgo != null ? daysAgo(q.sentDaysAgo) : null,
					validUntil: q.validUntilDaysFromNow != null ? daysFromNow(q.validUntilDaysFromNow) : null,
					createdAt: daysAgo(opp.internalDateDaysAgo)
				}
			});
			for (let li = 0; li < q.lines.length; li++) {
				const line = q.lines[li];
				const lineId = entityId('6c6c6c6c', oppNum, li + 1);
				await prisma.quoteLineItem.upsert({
					where: { id: lineId },
					update: {},
					create: {
						id: lineId,
						quoteDraftId,
						position: li,
						description: line.description,
						unit: line.unit,
						quantity: line.quantity as unknown as Prisma.Decimal,
						unitPriceEur:
							line.unitPriceEur == null ? null : (line.unitPriceEur as unknown as Prisma.Decimal),
						vatRate: line.vatRate ?? 21,
						vatReverseCharged: line.vatReverseCharged ?? false,
						source: line.source,
						note: line.note ?? null
					}
				});
			}
			const pdfFilenames = q.pdfFilenames ?? [];
			for (let pi = 0; pi < pdfFilenames.length; pi++) {
				const pdfId = entityId('6d6d6d6d', oppNum, pi + 1);
				pdfIds.push(pdfId);
				const pdfStorageKey = `quote-pdfs/${opp.opportunityId}/${pdfId}-${pdfFilenames[pi]}`;
				await writeDummyAsset(pdfStorageKey, 'application/pdf', pdfFilenames[pi]);
				await prisma.quotePdf.upsert({
					where: { id: pdfId },
					update: {},
					create: {
						id: pdfId,
						organizationId: opp.organizationId,
						opportunityId: opp.opportunityId,
						quoteDraftId,
						filename: pdfFilenames[pi],
						contentType: 'application/pdf',
						sizeBytes: 48_000 + pi * 1500,
						storageKey: pdfStorageKey,
						storageDriver: 'local',
						createdAt: daysAgo(Math.max(0, opp.internalDateDaysAgo - pi))
					}
				});
			}
		}

		// ── Reply drafts (1:N) + their attachments (owner uploads + quote-PDF copies) ──
		if (opp.drafts) {
			for (let di = 0; di < opp.drafts.length; di++) {
				const d = opp.drafts[di];
				const draftId = entityId('44444444', oppNum, di + 1);
				await prisma.replyDraft.upsert({
					where: { id: draftId },
					update: {},
					create: {
						id: draftId,
						opportunityId: opp.opportunityId,
						originalBody: d.body,
						body: d.body,
						status: d.status,
						kind: d.kind ?? ReplyDraftKind.REPLY,
						wasEditedByUser: d.wasEditedByUser ?? d.status === ReplyDraftStatus.EDITED,
						sentAt:
							d.status === ReplyDraftStatus.SENT && d.sentDaysAgo != null ? daysAgo(d.sentDaysAgo) : null,
						createdAt: daysAgo(d.createdDaysAgo)
					}
				});
				for (let ai = 0; ai < (d.attachments?.length ?? 0); ai++) {
					const a = d.attachments![ai];
					const attId = entityId('4a4a4a4a', oppNum, di * 10 + ai + 1);
					const quotePdfId = a.isQuotePdf && pdfIds.length > 0 ? pdfIds[pdfIds.length - 1] : null;
					const attStorageKey = `${draftId}/${attId}-${a.filename}`;
					await writeDummyAsset(attStorageKey, a.contentType, a.filename);
					await prisma.replyDraftAttachment.upsert({
						where: { id: attId },
						update: {},
						create: {
							id: attId,
							replyDraftId: draftId,
							filename: a.filename,
							contentType: a.contentType,
							sizeBytes: a.sizeBytes,
							storageKey: attStorageKey,
							storageDriver: 'local',
							quotePdfId
						}
					});
				}
			}
		}

		// ── Smart-expiry suggestion (W13) ──
		if (opp.expiryAction && quoteDraftId) {
			const ea = opp.expiryAction;
			const eaId = entityId('e7e7e7e7', oppNum, 1);
			await prisma.expiryAction.upsert({
				where: { id: eaId },
				update: {},
				create: {
					id: eaId,
					organizationId: opp.organizationId,
					opportunityId: opp.opportunityId,
					quoteDraftId,
					validUntil: daysFromNow(ea.validUntilDaysFromNow),
					status: ea.status,
					recommendedAction: ea.recommendedAction,
					suggestedCopy: ea.suggestedCopy,
					takenAction: ea.takenAction ?? null,
					takenById: ea.takenByEmail ? userId(ea.takenByEmail) : null,
					createdAt: daysAgo(2)
				}
			});
		}

		// ── Thread messages (customer replies + own-org outbound) ──
		if (opp.threadMessages) {
			let latestCustomerId: string | null = null;
			let latestCustomerDays = Number.POSITIVE_INFINITY;
			for (let ti = 0; ti < opp.threadMessages.length; ti++) {
				const tm = opp.threadMessages[ti];
				const msgId = entityId('2a2a2a2a', oppNum, ti + 1);
				await prisma.rawMessage.upsert({
					where: { id: msgId },
					update: {},
					create: {
						id: msgId,
						emailAccountId: opp.emailAccountId,
						organizationId: opp.organizationId,
						providerMessageId: `seed-thread-${msgId}`,
						threadId: `seed-thread-${opp.rawMessageId}`,
						internalDate: daysAgo(tm.daysAgo),
						subject: `Re: ${opp.subject}`,
						fromEmail: tm.fromEmail,
						fromName: tm.fromName,
						raw: gmailTextPayload(tm.bodyText),
						isQuoteRequest: tm.fromCustomer,
						classifiedAt: daysAgo(tm.daysAgo),
						wasDetectedAsCloser: tm.wasDetectedAsCloser ?? false,
						opportunityId: opp.opportunityId
					}
				});
				if (tm.fromCustomer && tm.daysAgo < latestCustomerDays) {
					latestCustomerDays = tm.daysAgo;
					latestCustomerId = msgId;
				}
			}
			if (latestCustomerId) {
				await prisma.opportunity.update({
					where: { id: opp.opportunityId },
					data: { latestCustomerRawMessageId: latestCustomerId }
				});
			}
		}

		// ── In-app notifications (bell) ──
		if (opp.notifications) {
			for (let ni = 0; ni < opp.notifications.length; ni++) {
				const n = opp.notifications[ni];
				const notifId = entityId('77777777', oppNum, ni + 1);
				await prisma.notification.upsert({
					where: { id: notifId },
					update: {},
					create: {
						id: notifId,
						userId: assigneeId ?? mailboxOwner.id,
						organizationId: opp.organizationId,
						eventType: n.eventType,
						title: n.title,
						body: n.body,
						link: `/opportunities/${opp.opportunityId}`,
						metadata: { opportunityId: opp.opportunityId, customerName: opp.customerName },
						readAt: n.read ? daysAgo(n.daysAgo) : null,
						createdAt: daysAgo(n.daysAgo)
					}
				});
			}
		}

		// ── Extra timeline audit-log rows (status changes, assignment, auto-cold) ──
		if (opp.timeline) {
			for (let tli = 0; tli < opp.timeline.length; tli++) {
				const tl = opp.timeline[tli];
				const logId = entityId('5a5a5a5a', oppNum, tli + 1);
				await prisma.log.upsert({
					where: { id: logId },
					update: {},
					create: {
						id: logId,
						level: LogLevel.INFO,
						message: `Opportunity ${opp.opportunityId} ${tl.action}`,
						context: 'OpportunitiesService',
						organizationId: opp.organizationId,
						createdAt: daysAgo(tl.daysAgo),
						metadata: {
							action: tl.action,
							organizationId: opp.organizationId,
							opportunityId: opp.opportunityId,
							actorUserId: tl.actorEmail ? userId(tl.actorEmail) : null,
							...(tl.extra ?? {})
						}
					}
				});
			}
		}
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

	// Status + dismiss/assignment breakdown so a reseed shows the funnel is populated.
	const byStatus = opportunities.reduce<Record<string, number>>((acc, o) => {
		acc[o.status] = (acc[o.status] ?? 0) + 1;
		return acc;
	}, {});
	console.log(
		`  By status: ${Object.entries(byStatus)
			.map(([s, n]) => `${s}=${n}`)
			.join(', ')}`
	);
	const dismissed = opportunities.filter(o => o.dismiss);
	const dismissByReason = dismissed.reduce<Record<string, number>>((acc, o) => {
		acc[o.dismiss!.reason] = (acc[o.dismiss!.reason] ?? 0) + 1;
		return acc;
	}, {});
	console.log(
		`  Dismissed: ${dismissed.length}${
			dismissed.length
				? ` (${Object.entries(dismissByReason)
						.map(([r, n]) => `${r}=${n}`)
						.join(', ')})`
				: ''
		} · Unassigned: ${opportunities.filter(o => o.assignedToEmail === null).length}`
	);

	// Related scenario records — counted from the specs `main()` materialized above.
	const drafts = opportunities.flatMap(o => o.drafts ?? []);
	const quotes = opportunities.flatMap(o => (o.quote ? [o.quote] : []));
	const lineItems = quotes.reduce((n, q) => n + q.lines.length, 0);
	const pdfs = quotes.reduce((n, q) => n + (q.pdfFilenames?.length ?? 0), 0);
	const attachments = drafts.reduce((n, d) => n + (d.attachments?.length ?? 0), 0);
	const expiry = opportunities.filter(o => o.expiryAction);
	const threadMsgs = opportunities.reduce((n, o) => n + (o.threadMessages?.length ?? 0), 0);
	const notifs = opportunities.reduce((n, o) => n + (o.notifications?.length ?? 0), 0);
	const timelineLogs = opportunities.reduce((n, o) => n + (o.timeline?.length ?? 0), 0);

	console.log('\nRelated scenario records:');
	console.log(
		`  Reply drafts:      ${drafts.length} (sent ${drafts.filter(d => d.status === ReplyDraftStatus.SENT).length}, pending ${drafts.filter(d => d.status === ReplyDraftStatus.PENDING_APPROVAL).length}, edited ${drafts.filter(d => d.status === ReplyDraftStatus.EDITED).length}, check-in ${drafts.filter(d => d.kind === ReplyDraftKind.CHECK_IN).length})`
	);
	console.log(
		`  Quote drafts:      ${quotes.length} (sent ${quotes.filter(q => q.status === QuoteDraftStatus.SENT).length}, draft ${quotes.filter(q => q.status === QuoteDraftStatus.DRAFT).length})`
	);
	console.log(`  Quote line items:  ${lineItems}`);
	console.log(`  Quote PDFs:        ${pdfs}`);
	console.log(`  Draft attachments: ${attachments}`);
	console.log(
		`  Expiry actions:    ${expiry.length} (suggested ${expiry.filter(o => o.expiryAction!.status === ExpiryActionStatus.SUGGESTED).length}, taken ${expiry.filter(o => o.expiryAction!.status === ExpiryActionStatus.TAKEN).length}, dismissed ${expiry.filter(o => o.expiryAction!.status === ExpiryActionStatus.DISMISSED).length})`
	);
	console.log(`  Thread messages:   ${threadMsgs}`);
	console.log(`  Notifications:     ${notifs}`);
	console.log(`  Timeline logs:     ${timelineLogs}`);

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
