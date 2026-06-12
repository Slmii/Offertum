/**
 * Opaque pagination cursor for `GET /api/opportunities`.
 *
 * Format: base64url of `${createdAt.toISOString()}|${id}`. We deliberately don't expose
 * the unencoded form on the wire — keeps clients from constructing cursors locally and
 * makes future schema changes (extra sort keys, encryption) drop-in.
 *
 * Decoder is intentionally tolerant: bad input returns `null` so the controller treats
 * it as "no cursor" rather than 4xx-ing — a stale URL after a deploy shouldn't bomb the
 * page. The web app re-requests page 1 if `nextCursor` it remembered no longer parses.
 */

export interface OpportunityListCursor {
	createdAt: Date;
	id: string;
}

// The id half feeds a Prisma filter on a uuid column; a non-UUID would surface as a
// Postgres 22P02 cast error (500) instead of the tolerant-null contract above.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeOpportunityListCursor(cursor: OpportunityListCursor): string {
	const payload = `${cursor.createdAt.toISOString()}|${cursor.id}`;
	return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeOpportunityListCursor(value: string | null | undefined): OpportunityListCursor | null {
	if (!value) {
		return null;
	}

	let decoded: string;
	try {
		decoded = Buffer.from(value, 'base64url').toString('utf8');
	} catch {
		return null;
	}

	const separatorIndex = decoded.indexOf('|');
	if (separatorIndex <= 0 || separatorIndex === decoded.length - 1) {
		return null;
	}

	const createdAtIso = decoded.slice(0, separatorIndex);
	const id = decoded.slice(separatorIndex + 1);
	const createdAt = new Date(createdAtIso);
	if (Number.isNaN(createdAt.getTime())) {
		return null;
	}
	if (!UUID_PATTERN.test(id)) {
		return null;
	}

	return { createdAt, id };
}
