import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
});

const SEED_ORG_ID = '00000000-0000-0000-0000-000000000001';
const SEED_OWNER_EMAIL = 'owner@quoteom.dev';

async function main() {
	const owner = await prisma.user.upsert({
		where: { email: SEED_OWNER_EMAIL },
		update: {},
		create: { email: SEED_OWNER_EMAIL, name: 'Seed Owner' }
	});

	const org = await prisma.organization.upsert({
		where: { id: SEED_ORG_ID },
		update: {},
		create: { id: SEED_ORG_ID, name: 'Seed Organization' }
	});

	await prisma.membership.upsert({
		where: { userId_organizationId: { userId: owner.id, organizationId: org.id } },
		update: {},
		create: { userId: owner.id, organizationId: org.id, role: 'OWNER' }
	});

	console.log('Seeded:');
	console.log(`  Owner: ${owner.email} (${owner.id})`);
	console.log(`  Org:   ${org.name} (${org.id})`);
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
