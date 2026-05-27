import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../.env') });

import {
	EmailProvider,
	MembershipRole,
	OpportunityStatus,
	type Prisma,
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
	{ email: 'jeroen@quoteom.dev', name: 'Jeroen Bakker', currentOrg: ORG_ACME },
	{ email: 'bart@quoteom.dev', name: 'Bart de Vries', currentOrg: ORG_BOUW },
	{ email: 'sander@quoteom.dev', name: 'Sander van Klink', currentOrg: ORG_ACME }
] as const;

const memberships: ReadonlyArray<{ email: string; orgId: string; role: MembershipRole }> = [
	{ email: 'selami1992@gmail.com', orgId: ORG_ACME, role: MembershipRole.OWNER },
	{ email: 'jeroen@quoteom.dev', orgId: ORG_ACME, role: MembershipRole.MEMBER },
	{ email: 'bart@quoteom.dev', orgId: ORG_BOUW, role: MembershipRole.OWNER },
	// Sander is a freelance bookkeeper helping both orgs — same user, two memberships.
	{ email: 'sander@quoteom.dev', orgId: ORG_ACME, role: MembershipRole.EXTERNAL },
	{ email: 'sander@quoteom.dev', orgId: ORG_BOUW, role: MembershipRole.EXTERNAL }
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
		ownerEmail: 'bart@quoteom.dev',
		mailboxEmail: 'offertes+seed@bouwbedrijfdevries.nl'
	}
] as const;

interface SeedOpportunity {
	rawMessageId: string;
	opportunityId: string;
	organizationId: string;
	emailAccountId: string;
	subject: string;
	fromEmail: string;
	fromName: string;
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
		customerName: 'Marieke Jansen',
		customerEmail: 'marieke.jansen@example.nl',
		address: 'Hoofdstraat 12, 3811 EN Amersfoort',
		requestType: 'CV-ketel vervanging (gas → hybride warmtepomp)',
		urgency: Urgency.NORMAL,
		status: OpportunityStatus.NEW,
		classifierConfidence: 0.94,
		classifierReason: 'Expliciete offerte-aanvraag met locatie + werkzaamheden.',
		deliverableHints: { rooms: 1, currentSystem: 'Remeha Calenta 25c', wantsHybrid: true },
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
		customerName: 'Pieter de Vos',
		customerEmail: 'pieter.devos@example.nl',
		address: 'Kerkstraat 88, 1011 AB Amsterdam',
		requestType: 'Loodgieterswerk — acute lekkage badkamervloer',
		urgency: Urgency.EMERGENCY,
		status: OpportunityStatus.NEW,
		classifierConfidence: 0.99,
		classifierReason: 'Spoedklus met duidelijke locatie en symptoom.',
		deliverableHints: { issue: 'lekkage', visibleDamage: true },
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
		customerName: 'Lisa Bakker',
		customerEmail: 'lisa.bakker@example.nl',
		address: 'Lange Voorhout 4, 2514 EE Den Haag',
		requestType: 'Elektra — krachtstroomgroep inductiekookplaat',
		urgency: Urgency.HIGH,
		status: OpportunityStatus.REPLIED,
		classifierConfidence: 0.91,
		classifierReason: 'Specifieke installatie met datum-indicatie.',
		deliverableHints: { rangeKw: 7.4, hasCrackedTile: false },
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
		customerName: 'Jurgen ten Have',
		customerEmail: 'jurgen@bedrijfx.nl',
		address: 'Industrieweg 22, 5708 AK Helmond',
		requestType: 'Airco — multi-split twee binnenunits',
		urgency: Urgency.NORMAL,
		status: OpportunityStatus.WAITING,
		classifierConfidence: 0.87,
		classifierReason: 'Offerte-aanvraag, klant wacht op prijs.',
		deliverableHints: { rooms: 2, isInsulated: true },
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
		customerName: 'Familie van der Berg',
		customerEmail: 'familie.vanderberg@example.nl',
		address: 'Dorpsstraat 3, 7152 GE Eibergen',
		requestType: 'CV jaarlijks onderhoudscontract',
		urgency: Urgency.LOW,
		status: OpportunityStatus.WON,
		classifierConfidence: 0.96,
		classifierReason: 'Terugkerend onderhoudscontract.',
		deliverableHints: { contractTerm: 'jaarlijks' },
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
		customerName: 'Sara Kuipers',
		customerEmail: 'sara.kuipers@example.nl',
		address: 'Brouwersgracht 41, 1015 GA Amsterdam',
		requestType: 'Verbouwing — uitbouw achterkamer ~12 m²',
		urgency: Urgency.NORMAL,
		status: OpportunityStatus.NEW,
		classifierConfidence: 0.92,
		classifierReason: 'Concreet project met afmetingen.',
		deliverableHints: { surfaceSqm: 12, hasDrawings: false },
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
		customerName: 'Tom Visser',
		customerEmail: 'tom.visser@example.nl',
		address: 'Wilgenlaan 17, 3742 BX Baarn',
		requestType: 'Dakkapel — voorzijde ~2,5 m breed',
		urgency: Urgency.NORMAL,
		status: OpportunityStatus.REPLIED,
		classifierConfidence: 0.93,
		classifierReason: 'Klassieke offerte-aanvraag dakkapel.',
		deliverableHints: { widthM: 2.5, hasPermit: false },
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
		customerName: 'Familie Geerts',
		customerEmail: 'familie.geerts@example.nl',
		address: 'Oranjestraat 25, 6711 GG Ede',
		requestType: 'Badkamerrenovatie — complete strip + nieuw',
		urgency: Urgency.HIGH,
		status: OpportunityStatus.WAITING,
		classifierConfidence: 0.95,
		classifierReason: 'Vervolgvraag op eerdere offerte met aanvullende info.',
		deliverableHints: { surfaceSqm: 8, wantsRainShower: true },
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
		customerName: 'Wouter Smits',
		customerEmail: 'wouter.smits@example.nl',
		address: 'Schoolweg 9, 8061 BB Hasselt',
		requestType: 'Isolatie — vrijstaande schuur 18 m²',
		urgency: Urgency.LOW,
		status: OpportunityStatus.COLD,
		classifierConfidence: 0.88,
		classifierReason: 'Isolatiewerkzaamheden, klant niet gereageerd na 2 herinneringen.',
		deliverableHints: { surfaceSqm: 18, currentInsulation: 'none' },
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
		customerName: 'Jasper Koopmans',
		customerEmail: 'jasper.koopmans@example.nl',
		address: 'Markt 14, 5611 EB Eindhoven',
		requestType: 'Keukenrenovatie — IKEA Metod inbouw',
		urgency: Urgency.NORMAL,
		status: OpportunityStatus.LOST,
		classifierConfidence: 0.9,
		classifierReason: 'Keukenofferte, klant koos andere aannemer.',
		deliverableHints: { brand: 'IKEA Metod', wantsAppliancesInstalled: true },
		internalDateDaysAgo: 60,
		deadlineDaysFromNow: null,
		appointmentDaysFromNow: null
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
			where: { email: opp.organizationId === ORG_ACME ? 'selami1992@gmail.com' : 'bart@quoteom.dev' }
		});

		await prisma.rawMessage.upsert({
			where: { id: opp.rawMessageId },
			update: {
				subject: opp.subject,
				fromEmail: opp.fromEmail,
				fromName: opp.fromName,
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
				raw: {
					seed: true,
					note: 'Synthetic RawMessage produced by prisma/seed.ts — not a real provider payload.'
				},
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
