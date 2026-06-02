# W12 — Offerte Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the dates Offertum already extracts (quote sent, expiry, appointment, deadline, follow-up) in an in-app calendar and a per-user iCal subscription feed, so quotes stop silently expiring and appointments stop being missed.

**Architecture:** Events are *projected on read* from current `Opportunity` + `QuoteDraft` + `ReplyDraft` rows by a pure mapper — no `OfferteEvent` table, no backfill, no drift. A new `calendar` API module exposes an authenticated JSON endpoint (for FullCalendar) and a public token-authenticated `text/calendar` feed (hand-rolled iCal serializer). The web app renders FullCalendar (month/week/agenda) and a settings page to manage the feed token.

**Tech Stack:** NestJS 11 + Prisma 7 (API), TanStack Start + React 19 + MUI v9 + TanStack Query v5 (web), FullCalendar React (new web dep, approved), hand-rolled RFC 5545 serializer (no API dep).

**Spec:** `docs/superpowers/specs/2026-06-02-w12-offerte-calendar-design.md`

---

## File structure

**API (`apps/api/src/`)**
- `modules/calendar/calendar-event-type.ts` — `CalendarEventType` union + per-type metadata (Dutch label prefix, all-day flag, color key).
- `modules/calendar/calendar-event.mapper.ts` — PURE: source rows + org config → `CalendarEvent[]`.
- `modules/calendar/calendar.repository.ts` — Prisma reads (active opps + sent quote drafts + latest sent reply draft + check-in count).
- `modules/calendar/calendar.service.ts` — orchestrates repo → mapper → window filter; feed-token generate/revoke.
- `modules/calendar/calendar.controller.ts` — authenticated events read + token management (in OpenAPI).
- `modules/calendar/calendar-ical.controller.ts` — public token-auth feed only (`@ApiExcludeController`).
- `modules/calendar/calendar.module.ts` — wiring.
- `modules/calendar/dto/calendar-event.response.dto.ts` — `CalendarEventDto`.
- `modules/calendar/dto/ical-feed.response.dto.ts` — `IcalFeedResponseDto`.
- `lib/calendar/ical-serializer.ts` — hand-rolled VCALENDAR/VEVENT builder.
- `lib/errors.ts` — add calendar error constants (MODIFY).
- `app.module.ts` — register `CalendarModule` (MODIFY).
- `prisma/schema.prisma` — add `Organization.quoteValidityDays`, `User.icalFeedToken` (MODIFY).

**Shared (`apps/shared/src/`)**
- `calendar.ts` — wire types.
- `index.ts` — export `./calendar.js` (MODIFY).

**Web (`apps/web/src/`)**
- `lib/api/calendar.api.ts` — `createServerFn` handlers.
- `lib/queries/calendar.queries.ts` — queryOptions + token mutations.
- `lib/utils/calendar.utils.ts` — type → color + Dutch label.
- `routes/(app)/calendar/index.tsx` — FullCalendar route.
- `routes/(app)/settings/calendar.tsx` — iCal feed management.
- `routes/(app)/index.tsx` — add "Agenda" nav button (MODIFY).

---

## Task 1: Schema changes (USER runs migration + generate)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add `quoteValidityDays` to the Organization model**

In `model Organization`, immediately after the `coldAfterDays Int @default(14)` line (around line 240), add:

```prisma
  // Quote expiry window: a sent quote is treated as valid for this many days.
  // Drives the calendar `expiry` event (QuoteDraft.sentAt + quoteValidityDays).
  // 30-day default mirrors followUpCadenceDays/coldAfterDays. Owner-configurable later.
  quoteValidityDays         Int      @default(30)
```

- [ ] **Step 2: Add `icalFeedToken` to the User model**

In `model User`, after `tonePlaybookUpdatedAt DateTime?` (around line 210), add:

```prisma
  // Per-user secret for the iCal subscription feed (/api/calendar/ical/:token.ics).
  // NULL = feed disabled. Generated on first enable; regenerate to rotate (invalidates
  // the old URL); set NULL to revoke. 32-byte base64url, unguessable. @unique so a feed
  // lookup is a single indexed read.
  icalFeedToken         String?   @unique
```

- [ ] **Step 3: STOP — hand the migration to the user**

Do NOT run any Prisma command. Print this message and wait:

> Schema edited. Please run these yourself, then tell me when done:
> ```bash
> cd apps/api && pnpm db:migrate   # name it e.g. calendar_w12
> pnpm db:generate
> ```
> Code in later tasks that references `quoteValidityDays` / `icalFeedToken` will not typecheck until these run — that's expected.

- [ ] **Step 4: Commit (after user confirms migration ran)**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(calendar): add quoteValidityDays + icalFeedToken schema fields"
```

---

## Task 2: Shared wire types

**Files:**
- Create: `apps/shared/src/calendar.ts`
- Modify: `apps/shared/src/index.ts`

- [ ] **Step 1: Create the shared types**

```ts
// apps/shared/src/calendar.ts

/** The five date kinds Offertum projects onto the calendar. */
export type CalendarEventType = 'sent' | 'expiry' | 'appointment' | 'deadline' | 'follow_up';

/** Whose opportunities the calendar/feed shows. `mine` = assigned to the requesting user. */
export type CalendarEventScope = 'mine' | 'all';

export const CALENDAR_EVENT_TYPES: readonly CalendarEventType[] = [
	'sent',
	'expiry',
	'appointment',
	'deadline',
	'follow_up'
] as const;

export const CALENDAR_EVENT_SCOPES: readonly CalendarEventScope[] = ['mine', 'all'] as const;

/** One calendar marker on the wire. Dates are ISO strings (see shared/index.ts convention). */
export interface CalendarEvent {
	id: string; // deterministic synthetic key, stable across refetches: `${sourceId}:${type}`
	opportunityId: string;
	type: CalendarEventType;
	title: string;
	at: string; // ISO timestamp
	allDay: boolean;
}

/** iCal feed token status / post-rotation result. `url` is null when the feed is disabled. */
export interface IcalFeed {
	url: string | null;
}
```

- [ ] **Step 2: Export it from the shared barrel**

In `apps/shared/src/index.ts`, add alphabetically near the other exports (after `export * from './business-details.js';`):

```ts
export * from './calendar.js';
```

- [ ] **Step 3: Build shared + verify typecheck**

Run: `pnpm --filter @offertum/shared build && pnpm --filter @offertum/shared typecheck`
Expected: PASS (emits `dist/calendar.js` + `.d.ts`).

- [ ] **Step 4: Commit**

```bash
git add apps/shared/src/calendar.ts apps/shared/src/index.ts
git commit -m "feat(calendar): add shared CalendarEvent + IcalFeed wire types"
```

---

## Task 3: Event-type metadata

**Files:**
- Create: `apps/api/src/modules/calendar/calendar-event-type.ts`

- [ ] **Step 1: Create the metadata table**

```ts
// apps/api/src/modules/calendar/calendar-event-type.ts
import type { CalendarEventType } from '@offertum/shared';

interface CalendarEventTypeMeta {
	/** Dutch title prefix shown before the customer label, e.g. "Offerte verstuurd". */
	labelPrefix: string;
	/** Whether the event renders as an all-day marker (date only) vs. a timed event. */
	allDay: boolean;
}

/**
 * Per-type presentation metadata. The mapper reads `labelPrefix` + `allDay` from here so
 * adding/retuning a type is a one-line change. Web colors live separately in
 * `apps/web/src/lib/utils/calendar.utils.ts` (the API doesn't own presentation color).
 */
export const CALENDAR_EVENT_TYPE_META: Record<CalendarEventType, CalendarEventTypeMeta> = {
	sent: { labelPrefix: 'Offerte verstuurd', allDay: false },
	expiry: { labelPrefix: 'Offerte verloopt', allDay: true },
	appointment: { labelPrefix: 'Afspraak', allDay: false },
	deadline: { labelPrefix: 'Deadline klant', allDay: true },
	follow_up: { labelPrefix: 'Opvolging', allDay: true }
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/calendar/calendar-event-type.ts
git commit -m "feat(calendar): add event-type presentation metadata"
```

---

## Task 4: Pure event mapper (TDD)

**Files:**
- Create: `apps/api/src/modules/calendar/calendar-event.mapper.ts`
- Test: `apps/api/src/modules/calendar/calendar-event.mapper.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/calendar/calendar-event.mapper.spec.ts
import { describe, expect, it } from '@jest/globals';
import { toCalendarEvents, type CalendarEventSource, type OrgCalendarConfig } from './calendar-event.mapper';

const CFG: OrgCalendarConfig = { quoteValidityDays: 30, followUpCadenceDays: 4, followUpMaxCount: 2 };

function baseSource(overrides: Partial<CalendarEventSource> = {}): CalendarEventSource {
	return {
		opportunityId: 'opp-1',
		status: 'NEW',
		dismissedAt: null,
		customerName: 'Jansen',
		customerDeadline: null,
		customerAppointment: null,
		assignedToUserId: null,
		sentQuoteDrafts: [],
		latestSentReplyDraftAt: null,
		priorCheckInCount: 0,
		...overrides
	};
}

describe('toCalendarEvents', () => {
	it('returns no events for a dismissed opportunity', () => {
		const events = toCalendarEvents(
			baseSource({ dismissedAt: new Date('2026-06-01'), customerAppointment: new Date('2026-06-10') }),
			CFG
		);
		expect(events).toEqual([]);
	});

	it('emits an appointment event (timed) with a stable id', () => {
		const events = toCalendarEvents(baseSource({ customerAppointment: new Date('2026-06-10T09:30:00.000Z') }), CFG);
		expect(events).toEqual([
			{
				id: 'opp-1:appointment',
				opportunityId: 'opp-1',
				type: 'appointment',
				title: 'Afspraak — Jansen',
				at: '2026-06-10T09:30:00.000Z',
				allDay: false
			}
		]);
	});

	it('emits a deadline event (all-day)', () => {
		const events = toCalendarEvents(baseSource({ customerDeadline: new Date('2026-06-15T00:00:00.000Z') }), CFG);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ type: 'deadline', allDay: true, title: 'Deadline klant — Jansen' });
	});

	it('emits sent + expiry per sent quote draft (expiry = sentAt + quoteValidityDays)', () => {
		const events = toCalendarEvents(
			baseSource({ sentQuoteDrafts: [{ id: 'qd-1', sentAt: new Date('2026-06-01T08:00:00.000Z') }] }),
			CFG
		);
		const byType = Object.fromEntries(events.map(e => [e.type, e]));
		expect(byType.sent).toMatchObject({ id: 'qd-1:sent', at: '2026-06-01T08:00:00.000Z', allDay: false });
		expect(byType.expiry).toMatchObject({ id: 'qd-1:expiry', at: '2026-07-01T08:00:00.000Z', allDay: true });
	});

	it('emits a follow_up event when REPLIED, under cap, with a sent reply draft', () => {
		const events = toCalendarEvents(
			baseSource({ status: 'REPLIED', latestSentReplyDraftAt: new Date('2026-06-01T08:00:00.000Z'), priorCheckInCount: 1 }),
			CFG
		);
		const followUp = events.find(e => e.type === 'follow_up');
		expect(followUp).toMatchObject({ id: 'opp-1:follow_up', at: '2026-06-05T08:00:00.000Z', allDay: true });
	});

	it('suppresses follow_up when the check-in cap is reached', () => {
		const events = toCalendarEvents(
			baseSource({ status: 'REPLIED', latestSentReplyDraftAt: new Date('2026-06-01T08:00:00.000Z'), priorCheckInCount: 2 }),
			CFG
		);
		expect(events.some(e => e.type === 'follow_up')).toBe(false);
	});

	it('suppresses follow_up when not REPLIED', () => {
		const events = toCalendarEvents(
			baseSource({ status: 'NEW', latestSentReplyDraftAt: new Date('2026-06-01T08:00:00.000Z') }),
			CFG
		);
		expect(events.some(e => e.type === 'follow_up')).toBe(false);
	});

	it('falls back to "Aanvraag" when customerName is null', () => {
		const events = toCalendarEvents(baseSource({ customerName: null, customerDeadline: new Date('2026-06-15') }), CFG);
		expect(events[0].title).toBe('Deadline klant — Aanvraag');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest src/modules/calendar/calendar-event.mapper.spec.ts`
Expected: FAIL — `Cannot find module './calendar-event.mapper'`.

- [ ] **Step 3: Write the mapper**

```ts
// apps/api/src/modules/calendar/calendar-event.mapper.ts
import type { OpportunityStatus } from '@/generated/prisma/enums';
import type { CalendarEvent, CalendarEventType } from '@offertum/shared';
import { CALENDAR_EVENT_TYPE_META } from './calendar-event-type';

export interface CalendarEventSource {
	opportunityId: string;
	status: OpportunityStatus;
	dismissedAt: Date | null;
	customerName: string | null;
	customerDeadline: Date | null;
	customerAppointment: Date | null;
	assignedToUserId: string | null;
	sentQuoteDrafts: { id: string; sentAt: Date }[];
	latestSentReplyDraftAt: Date | null;
	priorCheckInCount: number;
}

export interface OrgCalendarConfig {
	quoteValidityDays: number;
	followUpCadenceDays: number;
	followUpMaxCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * DAY_MS);
}

function buildEvent(id: string, opportunityId: string, type: CalendarEventType, label: string, at: Date): CalendarEvent {
	return {
		id,
		opportunityId,
		type,
		title: `${CALENDAR_EVENT_TYPE_META[type].labelPrefix} — ${label}`,
		at: at.toISOString(),
		allDay: CALENDAR_EVENT_TYPE_META[type].allDay
	};
}

/**
 * Project a single opportunity's current rows into calendar events. Pure — no I/O. Dismissed
 * opportunities yield no events. Window filtering happens in the service, not here.
 */
export function toCalendarEvents(src: CalendarEventSource, cfg: OrgCalendarConfig): CalendarEvent[] {
	if (src.dismissedAt !== null) {
		return [];
	}

	const label = src.customerName ?? 'Aanvraag';
	const events: CalendarEvent[] = [];

	if (src.customerAppointment) {
		events.push(buildEvent(`${src.opportunityId}:appointment`, src.opportunityId, 'appointment', label, src.customerAppointment));
	}

	if (src.customerDeadline) {
		events.push(buildEvent(`${src.opportunityId}:deadline`, src.opportunityId, 'deadline', label, src.customerDeadline));
	}

	for (const draft of src.sentQuoteDrafts) {
		events.push(buildEvent(`${draft.id}:sent`, src.opportunityId, 'sent', label, draft.sentAt));
		events.push(buildEvent(`${draft.id}:expiry`, src.opportunityId, 'expiry', label, addDays(draft.sentAt, cfg.quoteValidityDays)));
	}

	// Follow-up: same eligibility as the silence-check-in scheduler — REPLIED, a sent reply
	// draft exists, and the per-opp check-in cap isn't exhausted (cap 0 disables it entirely).
	const followUpEligible =
		src.status === 'REPLIED' &&
		src.latestSentReplyDraftAt !== null &&
		cfg.followUpMaxCount > 0 &&
		src.priorCheckInCount < cfg.followUpMaxCount;
	if (followUpEligible && src.latestSentReplyDraftAt) {
		events.push(
			buildEvent(`${src.opportunityId}:follow_up`, src.opportunityId, 'follow_up', label, addDays(src.latestSentReplyDraftAt, cfg.followUpCadenceDays))
		);
	}

	return events;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest src/modules/calendar/calendar-event.mapper.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/calendar/calendar-event.mapper.ts apps/api/src/modules/calendar/calendar-event.mapper.spec.ts
git commit -m "feat(calendar): add pure opportunity→events mapper with tests"
```

---

## Task 5: Hand-rolled iCal serializer (TDD)

**Files:**
- Create: `apps/api/src/lib/calendar/ical-serializer.ts`
- Test: `apps/api/src/lib/calendar/ical-serializer.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/calendar/ical-serializer.spec.ts
import { describe, expect, it } from '@jest/globals';
import { serializeICalendar, type ICalEvent } from './ical-serializer';

const PROD_ID = '-//Offertum//Calendar//NL';

function unfold(ics: string): string {
	// RFC 5545 line unfolding: a CRLF followed by a space/tab continues the prior line.
	return ics.replace(/\r\n[ \t]/g, '');
}

describe('serializeICalendar', () => {
	it('wraps events in a VCALENDAR envelope with CRLF line endings', () => {
		const ics = serializeICalendar({ prodId: PROD_ID, dtstamp: new Date('2026-06-02T00:00:00.000Z'), events: [] });
		expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(ics.includes('VERSION:2.0\r\n')).toBe(true);
		expect(ics.includes(`PRODID:${PROD_ID}\r\n`)).toBe(true);
		expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
	});

	it('emits a timed VEVENT with UTC DTSTART', () => {
		const event: ICalEvent = {
			uid: 'qd-1:sent@offertum',
			summary: 'Offerte verstuurd — Jansen',
			at: new Date('2026-06-01T08:00:00.000Z'),
			allDay: false
		};
		const ics = serializeICalendar({ prodId: PROD_ID, dtstamp: new Date('2026-06-02T00:00:00.000Z'), events: [event] });
		expect(ics).toContain('UID:qd-1:sent@offertum\r\n');
		expect(ics).toContain('DTSTART:20260601T080000Z\r\n');
		expect(ics).toContain('SUMMARY:Offerte verstuurd — Jansen\r\n');
	});

	it('emits an all-day VEVENT with VALUE=DATE', () => {
		const event: ICalEvent = { uid: 'opp-1:deadline@offertum', summary: 'Deadline klant — Jansen', at: new Date('2026-06-15T00:00:00.000Z'), allDay: true };
		const ics = serializeICalendar({ prodId: PROD_ID, dtstamp: new Date('2026-06-02T00:00:00.000Z'), events: [event] });
		expect(ics).toContain('DTSTART;VALUE=DATE:20260615\r\n');
	});

	it('escapes commas, semicolons, and backslashes in SUMMARY', () => {
		const event: ICalEvent = { uid: 'x@offertum', summary: 'A, B; C \\ D', at: new Date('2026-06-01T08:00:00.000Z'), allDay: false };
		const ics = serializeICalendar({ prodId: PROD_ID, dtstamp: new Date('2026-06-02T00:00:00.000Z'), events: [event] });
		expect(ics).toContain('SUMMARY:A\\, B\\; C \\\\ D\r\n');
	});

	it('folds lines longer than 75 octets', () => {
		const longName = 'X'.repeat(200);
		const event: ICalEvent = { uid: 'x@offertum', summary: longName, at: new Date('2026-06-01T08:00:00.000Z'), allDay: false };
		const ics = serializeICalendar({ prodId: PROD_ID, dtstamp: new Date('2026-06-02T00:00:00.000Z'), events: [event] });
		// No physical line exceeds 75 octets...
		for (const line of ics.split('\r\n')) {
			expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
		}
		// ...but unfolding restores the full summary.
		expect(unfold(ics)).toContain(`SUMMARY:${longName}`);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest src/lib/calendar/ical-serializer.spec.ts`
Expected: FAIL — `Cannot find module './ical-serializer'`.

- [ ] **Step 3: Write the serializer**

```ts
// apps/api/src/lib/calendar/ical-serializer.ts

export interface ICalEvent {
	uid: string;
	summary: string;
	at: Date;
	allDay: boolean;
}

export interface ICalendarInput {
	prodId: string;
	dtstamp: Date;
	events: ICalEvent[];
}

const CRLF = '\r\n';

/** Escape per RFC 5545 §3.3.11: backslash, semicolon, comma, and newline in TEXT values. */
function escapeText(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** `YYYYMMDDTHHMMSSZ` (UTC) for timed values. */
function formatUtc(date: Date): string {
	return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** `YYYYMMDD` (UTC date) for all-day values. */
function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Fold a content line to ≤75 octets per RFC 5545 §3.1: split on UTF-8 byte boundaries,
 * continuation lines begin with a single space. Folds on bytes, not chars, so multi-byte
 * runes never get split mid-sequence.
 */
function foldLine(line: string): string {
	const bytes = Buffer.from(line, 'utf8');
	if (bytes.length <= 75) {
		return line;
	}
	const chunks: string[] = [];
	let start = 0;
	let limit = 75; // first line: 75 octets; continuations: 1 space + 74 octets
	while (start < bytes.length) {
		let end = Math.min(start + limit, bytes.length);
		// Back off so we don't split a multi-byte UTF-8 sequence (continuation bytes = 10xxxxxx).
		while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
			end -= 1;
		}
		chunks.push(bytes.subarray(start, end).toString('utf8'));
		start = end;
		limit = 74;
	}
	return chunks.join(`${CRLF} `);
}

function serializeEvent(event: ICalEvent, dtstamp: Date): string[] {
	const dtstart = event.allDay ? `DTSTART;VALUE=DATE:${formatDate(event.at)}` : `DTSTART:${formatUtc(event.at)}`;
	return [
		'BEGIN:VEVENT',
		foldLine(`UID:${event.uid}`),
		`DTSTAMP:${formatUtc(dtstamp)}`,
		foldLine(dtstart),
		foldLine(`SUMMARY:${escapeText(event.summary)}`),
		'END:VEVENT'
	];
}

/** Build a complete RFC 5545 VCALENDAR string (CRLF-terminated, folded, escaped). */
export function serializeICalendar(input: ICalendarInput): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		foldLine(`PRODID:${input.prodId}`),
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		...input.events.flatMap(event => serializeEvent(event, input.dtstamp)),
		'END:VCALENDAR'
	];
	return lines.join(CRLF) + CRLF;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest src/lib/calendar/ical-serializer.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/calendar/ical-serializer.ts apps/api/src/lib/calendar/ical-serializer.spec.ts
git commit -m "feat(calendar): add hand-rolled RFC 5545 iCal serializer with tests"
```

---

## Task 6: Error constants

**Files:**
- Modify: `apps/api/src/lib/errors.ts`

- [ ] **Step 1: Add calendar error constants**

Append near the end of `apps/api/src/lib/errors.ts` (single source of truth for thrown messages):

```ts
// ── Calendar (W12) ────────────────────────────────────────────────────────────
export const ICAL_FEED_TOKEN_NOT_FOUND = 'Calendar feed not found.';
export const ICAL_FEED_NO_ORGANIZATION = 'The calendar feed owner has no active organization.';
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/lib/errors.ts
git commit -m "feat(calendar): add calendar feed error constants"
```

---

## Task 7: Calendar repository

**Files:**
- Create: `apps/api/src/modules/calendar/calendar.repository.ts`

> The repository is thin Prisma glue. We don't TDD it (DB-bound, follows the existing
> repository pattern); the mapper + service carry the unit coverage. The service test
> (Task 9) mocks this repository.

- [ ] **Step 1: Write the repository**

```ts
// apps/api/src/modules/calendar/calendar.repository.ts
import { ReplyDraftKind, ReplyDraftStatus } from '@/generated/prisma/enums';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import type { CalendarEventScope } from '@offertum/shared';
import type { CalendarEventSource } from './calendar-event.mapper';

@Injectable()
export class CalendarRepository {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Fetch every active (non-dismissed) opportunity in the org plus the per-opp fields the
	 * mapper needs: sent quote drafts, the latest SENT reply-draft timestamp, and how many
	 * CHECK_IN drafts have already been generated (the follow-up cap counter). `scope=mine`
	 * narrows to opps assigned to `requestingUserId`. Returns the mapper's input shape so the
	 * service can map without a second transform.
	 */
	async findActiveSources(
		organizationId: string,
		scope: CalendarEventScope,
		requestingUserId: string | null
	): Promise<CalendarEventSource[]> {
		const opportunities = await this.prisma.opportunity.findMany({
			where: {
				organizationId,
				dismissedAt: null,
				...(scope === 'mine' && requestingUserId ? { assignedToUserId: requestingUserId } : {})
			},
			select: {
				id: true,
				status: true,
				dismissedAt: true,
				customerName: true,
				customerDeadline: true,
				customerAppointment: true,
				assignedToUserId: true,
				quoteDrafts: {
					where: { sentAt: { not: null } },
					select: { id: true, sentAt: true }
				},
				replyDrafts: {
					where: { status: ReplyDraftStatus.SENT, sentAt: { not: null } },
					orderBy: { sentAt: 'desc' },
					select: { sentAt: true, kind: true }
				}
			}
		});

		return opportunities.map(opp => {
			const latestSentReplyDraftAt = opp.replyDrafts[0]?.sentAt ?? null;
			const priorCheckInCount = opp.replyDrafts.filter(draft => draft.kind === ReplyDraftKind.CHECK_IN).length;
			return {
				opportunityId: opp.id,
				status: opp.status,
				dismissedAt: opp.dismissedAt,
				customerName: opp.customerName,
				customerDeadline: opp.customerDeadline,
				customerAppointment: opp.customerAppointment,
				assignedToUserId: opp.assignedToUserId,
				sentQuoteDrafts: opp.quoteDrafts
					.filter((draft): draft is { id: string; sentAt: Date } => draft.sentAt !== null)
					.map(draft => ({ id: draft.id, sentAt: draft.sentAt })),
				latestSentReplyDraftAt,
				priorCheckInCount
			};
		});
	}

	/** Look up the org config the mapper needs (windows + cap). */
	async findOrgCalendarConfig(
		organizationId: string
	): Promise<{ quoteValidityDays: number; followUpCadenceDays: number; followUpMaxCount: number } | null> {
		return this.prisma.organization.findUnique({
			where: { id: organizationId },
			select: { quoteValidityDays: true, followUpCadenceDays: true, followUpMaxCount: true }
		});
	}

	/** Resolve a user (+ their current org) by iCal feed token. Null when the token is unknown. */
	async findUserByIcalToken(token: string): Promise<{ id: string; currentOrganizationId: string | null } | null> {
		return this.prisma.user.findUnique({
			where: { icalFeedToken: token },
			select: { id: true, currentOrganizationId: true }
		});
	}

	/** Set (or rotate, or clear with null) the requesting user's feed token. */
	async setIcalToken(userId: string, token: string | null): Promise<void> {
		await this.prisma.user.update({ where: { id: userId }, data: { icalFeedToken: token } });
	}

	/** Read the current feed token (to render the URL on the settings page). */
	async findIcalToken(userId: string): Promise<string | null> {
		const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { icalFeedToken: true } });
		return user?.icalFeedToken ?? null;
	}
}
```

- [ ] **Step 2: Verify it compiles (depends on Task 1 migration being run)**

Run: `cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep calendar.repository || echo "no calendar.repository errors"`
Expected: `no calendar.repository errors`. If `quoteValidityDays` / `icalFeedToken` errors appear, the user has not run `pnpm db:generate` yet — STOP and ask them to.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/calendar/calendar.repository.ts
git commit -m "feat(calendar): add calendar repository (active sources + feed token)"
```

---

## Task 8: DTOs

**Files:**
- Create: `apps/api/src/modules/calendar/dto/calendar-event.response.dto.ts`
- Create: `apps/api/src/modules/calendar/dto/ical-feed.response.dto.ts`

- [ ] **Step 1: Create `CalendarEventDto`**

```ts
// apps/api/src/modules/calendar/dto/calendar-event.response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import type { CalendarEvent, CalendarEventType } from '@offertum/shared';

export class CalendarEventDto implements CalendarEvent {
	@ApiProperty()
	id!: string;

	@ApiProperty()
	opportunityId!: string;

	@ApiProperty({ enum: ['sent', 'expiry', 'appointment', 'deadline', 'follow_up'] })
	type!: CalendarEventType;

	@ApiProperty()
	title!: string;

	@ApiProperty({ description: 'ISO timestamp' })
	at!: string;

	@ApiProperty()
	allDay!: boolean;
}
```

- [ ] **Step 2: Create `IcalFeedResponseDto`**

```ts
// apps/api/src/modules/calendar/dto/ical-feed.response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import type { IcalFeed } from '@offertum/shared';

export class IcalFeedResponseDto implements IcalFeed {
	@ApiProperty({ type: String, nullable: true, description: 'Absolute feed URL, or null when disabled.' })
	url!: string | null;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/calendar/dto
git commit -m "feat(calendar): add CalendarEvent + IcalFeed response DTOs"
```

---

## Task 9: Calendar service (TDD)

**Files:**
- Create: `apps/api/src/modules/calendar/calendar.service.ts`
- Test: `apps/api/src/modules/calendar/calendar.service.spec.ts`

> Service responsibilities: (a) read sources + org config, map, and filter events to the
> requested `[from, to]` window; (b) build the rolling-window iCal feed for a token; (c)
> generate/rotate/revoke the feed token + build its absolute URL. `Date`/window math and
> the token lifecycle are the parts worth testing with a mocked repository.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/calendar/calendar.service.spec.ts
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { CalendarRepository } from './calendar.repository';
import { CalendarService } from './calendar.service';

const ORG_CFG = { quoteValidityDays: 30, followUpCadenceDays: 4, followUpMaxCount: 2 };

function makeRepo(overrides: Partial<jest.Mocked<CalendarRepository>> = {}): jest.Mocked<CalendarRepository> {
	return {
		findActiveSources: jest.fn<CalendarRepository['findActiveSources']>().mockResolvedValue([]),
		findOrgCalendarConfig: jest.fn<CalendarRepository['findOrgCalendarConfig']>().mockResolvedValue(ORG_CFG),
		findUserByIcalToken: jest.fn<CalendarRepository['findUserByIcalToken']>().mockResolvedValue(null),
		setIcalToken: jest.fn<CalendarRepository['setIcalToken']>().mockResolvedValue(undefined),
		findIcalToken: jest.fn<CalendarRepository['findIcalToken']>().mockResolvedValue(null),
		...overrides
	} as unknown as jest.Mocked<CalendarRepository>;
}

function makeConfig(webOrigin = 'https://app.offertum.test'): ConfigService {
	return { get: jest.fn(() => webOrigin) } as unknown as ConfigService;
}

describe('CalendarService', () => {
	let repo: jest.Mocked<CalendarRepository>;

	beforeEach(() => {
		repo = makeRepo();
	});

	describe('getEvents', () => {
		it('filters mapped events to the [from, to] window', async () => {
			repo.findActiveSources.mockResolvedValue([
				{
					opportunityId: 'opp-1',
					status: 'NEW',
					dismissedAt: null,
					customerName: 'Jansen',
					customerDeadline: new Date('2026-06-15T00:00:00.000Z'), // in window
					customerAppointment: new Date('2026-09-01T00:00:00.000Z'), // out of window
					assignedToUserId: null,
					sentQuoteDrafts: [],
					latestSentReplyDraftAt: null,
					priorCheckInCount: 0
				}
			]);
			const service = new CalendarService(repo, makeConfig());
			const events = await service.getEvents('org-1', { scope: 'all', requestingUserId: 'u1', from: new Date('2026-06-01'), to: new Date('2026-06-30') });
			expect(events.map(e => e.type)).toEqual(['deadline']);
		});

		it('returns [] when the org has no calendar config', async () => {
			repo.findOrgCalendarConfig.mockResolvedValue(null);
			const service = new CalendarService(repo, makeConfig());
			const events = await service.getEvents('org-1', { scope: 'all', requestingUserId: null, from: new Date('2026-06-01'), to: new Date('2026-06-30') });
			expect(events).toEqual([]);
		});
	});

	describe('feed token lifecycle', () => {
		it('generateFeedToken writes a token and returns its absolute URL', async () => {
			const service = new CalendarService(repo, makeConfig());
			const result = await service.generateFeedToken('user-1');
			expect(repo.setIcalToken).toHaveBeenCalledWith('user-1', expect.any(String));
			expect(result.url).toMatch(/^https:\/\/app\.offertum\.test\/api\/calendar\/ical\/[A-Za-z0-9_-]+\.ics$/);
		});

		it('revokeFeedToken clears the token and returns a null url', async () => {
			const service = new CalendarService(repo, makeConfig());
			const result = await service.revokeFeedToken('user-1');
			expect(repo.setIcalToken).toHaveBeenCalledWith('user-1', null);
			expect(result.url).toBeNull();
		});

		it('getFeedToken returns the existing url, or null when disabled', async () => {
			repo.findIcalToken.mockResolvedValue('existing-token');
			const service = new CalendarService(repo, makeConfig());
			expect((await service.getFeedToken('user-1')).url).toBe('https://app.offertum.test/api/calendar/ical/existing-token.ics');
			repo.findIcalToken.mockResolvedValue(null);
			expect((await service.getFeedToken('user-1')).url).toBeNull();
		});
	});

	describe('renderFeed', () => {
		it('throws NotFound for an unknown token', async () => {
			const service = new CalendarService(repo, makeConfig());
			await expect(service.renderFeed('nope')).rejects.toBeInstanceOf(NotFoundException);
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest src/modules/calendar/calendar.service.spec.ts`
Expected: FAIL — `Cannot find module './calendar.service'`.

- [ ] **Step 3: Write the service**

```ts
// apps/api/src/modules/calendar/calendar.service.ts
import type { EnvSchema } from '@/config/env.schema';
import { ICAL_FEED_NO_ORGANIZATION, ICAL_FEED_TOKEN_NOT_FOUND } from '@/lib/errors';
import { serializeICalendar, type ICalEvent } from '@/lib/calendar/ical-serializer';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CalendarEvent, CalendarEventScope, IcalFeed } from '@offertum/shared';
import { randomBytes } from 'node:crypto';
import { toCalendarEvents } from './calendar-event.mapper';
import { CalendarRepository } from './calendar.repository';

const FEED_TOKEN_BYTES = 32;
const PROD_ID = '-//Offertum//Calendar//NL';
const FEED_WINDOW_PAST_DAYS = 30;
const FEED_WINDOW_FUTURE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

interface GetEventsOptions {
	scope: CalendarEventScope;
	requestingUserId: string | null;
	from: Date;
	to: Date;
}

@Injectable()
export class CalendarService {
	constructor(
		private readonly repository: CalendarRepository,
		private readonly config: ConfigService<EnvSchema, true>
	) {}

	/** Authenticated read: mapped events for the org, filtered to the requested window. */
	async getEvents(organizationId: string, options: GetEventsOptions): Promise<CalendarEvent[]> {
		const config = await this.repository.findOrgCalendarConfig(organizationId);
		if (!config) {
			return [];
		}
		const sources = await this.repository.findActiveSources(organizationId, options.scope, options.requestingUserId);
		const fromMs = options.from.getTime();
		const toMs = options.to.getTime();
		return sources
			.flatMap(source => toCalendarEvents(source, config))
			.filter(event => {
				const atMs = new Date(event.at).getTime();
				return atMs >= fromMs && atMs <= toMs;
			});
	}

	/** Public feed: resolve token → org → render a rolling-window VCALENDAR string. */
	async renderFeed(token: string): Promise<string> {
		const user = await this.repository.findUserByIcalToken(token);
		if (!user) {
			throw new NotFoundException(ICAL_FEED_TOKEN_NOT_FOUND);
		}
		if (!user.currentOrganizationId) {
			throw new NotFoundException(ICAL_FEED_NO_ORGANIZATION);
		}
		const now = new Date();
		const from = new Date(now.getTime() - FEED_WINDOW_PAST_DAYS * DAY_MS);
		const to = new Date(now.getTime() + FEED_WINDOW_FUTURE_DAYS * DAY_MS);
		// Feed always shows the whole org (a subscribed feed has no per-user toggle).
		const events = await this.getEvents(user.currentOrganizationId, { scope: 'all', requestingUserId: null, from, to });
		const icalEvents: ICalEvent[] = events.map(event => ({
			uid: `${event.id}@offertum`,
			summary: event.title,
			at: new Date(event.at),
			allDay: event.allDay
		}));
		return serializeICalendar({ prodId: PROD_ID, dtstamp: now, events: icalEvents });
	}

	async getFeedToken(userId: string): Promise<IcalFeed> {
		const token = await this.repository.findIcalToken(userId);
		return { url: token ? this.feedUrl(token) : null };
	}

	async generateFeedToken(userId: string): Promise<IcalFeed> {
		const token = randomBytes(FEED_TOKEN_BYTES).toString('base64url');
		await this.repository.setIcalToken(userId, token);
		return { url: this.feedUrl(token) };
	}

	async revokeFeedToken(userId: string): Promise<IcalFeed> {
		await this.repository.setIcalToken(userId, null);
		return { url: null };
	}

	private feedUrl(token: string): string {
		const origin = this.config.get('WEB_ORIGIN', { infer: true });
		return `${origin}/api/calendar/ical/${token}.ics`;
	}
}
```

> Note on `ICAL_FEED_NO_ORGANIZATION`: it's thrown as `NotFoundException` so an orphaned-feed
> case returns 404 (not 500) to the subscribing calendar client — same "don't 5xx a poller"
> reasoning as the webhook controllers.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest src/modules/calendar/calendar.service.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/calendar/calendar.service.ts apps/api/src/modules/calendar/calendar.service.spec.ts
git commit -m "feat(calendar): add calendar service (events window + feed render + token lifecycle)"
```

---

## Task 10: Controllers + module + registration

**Files:**
- Create: `apps/api/src/modules/calendar/calendar.controller.ts`
- Create: `apps/api/src/modules/calendar/calendar-ical.controller.ts`
- Create: `apps/api/src/modules/calendar/calendar.module.ts`
- Test: `apps/api/src/modules/calendar/calendar-ical.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the authenticated controller**

```ts
// apps/api/src/modules/calendar/calendar.controller.ts
import { OrganizationGuard } from '@/common/guards/organization.guard';
import { NOT_AUTHENTICATED } from '@/lib/errors';
import { CalendarService } from '@/modules/calendar/calendar.service';
import { CalendarEventDto } from '@/modules/calendar/dto/calendar-event.response.dto';
import { IcalFeedResponseDto } from '@/modules/calendar/dto/ical-feed.response.dto';
import {
	BadRequestException,
	Controller,
	DefaultValuePipe,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Post,
	Query,
	Req,
	UnauthorizedException,
	UseGuards
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CalendarEventScope } from '@offertum/shared';
import type { Request } from 'express';

@ApiTags('calendar')
@Controller('calendar')
@UseGuards(OrganizationGuard)
export class CalendarController {
	constructor(private readonly calendar: CalendarService) {}

	@ApiOperation({ summary: 'Calendar events for the active org within a date window' })
	@ApiOkResponse({ type: [CalendarEventDto] })
	@Get('events')
	getEvents(
		@Req() request: Request,
		@Query('from') from: string,
		@Query('to') to: string,
		@Query('scope', new DefaultValuePipe('all')) scope: CalendarEventScope
	): Promise<CalendarEventDto[]> {
		const fromDate = new Date(from);
		const toDate = new Date(to);
		if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
			throw new BadRequestException('Query params `from` and `to` must be valid ISO dates.');
		}
		return this.calendar.getEvents(request.organizationId!, {
			scope: scope === 'mine' ? 'mine' : 'all',
			requestingUserId: request.authSession?.user?.id ?? null,
			from: fromDate,
			to: toDate
		});
	}

	@ApiOperation({ summary: 'Current iCal feed URL for the requesting user (null when disabled)' })
	@ApiOkResponse({ type: IcalFeedResponseDto })
	@Get('ical/token')
	getFeedToken(@Req() request: Request): Promise<IcalFeedResponseDto> {
		return this.calendar.getFeedToken(this.userId(request));
	}

	@ApiOperation({ summary: 'Generate or rotate the iCal feed token (invalidates the old URL)' })
	@ApiOkResponse({ type: IcalFeedResponseDto })
	@Post('ical/token')
	generateFeedToken(@Req() request: Request): Promise<IcalFeedResponseDto> {
		return this.calendar.generateFeedToken(this.userId(request));
	}

	@ApiOperation({ summary: 'Revoke the iCal feed token (disables the feed)' })
	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete('ical/token')
	async revokeFeedToken(@Req() request: Request): Promise<void> {
		await this.calendar.revokeFeedToken(this.userId(request));
	}

	private userId(request: Request): string {
		const id = request.authSession?.user?.id;
		if (!id) {
			throw new UnauthorizedException(NOT_AUTHENTICATED);
		}
		return id;
	}
}
```

- [ ] **Step 2: Write the public feed controller**

```ts
// apps/api/src/modules/calendar/calendar-ical.controller.ts
import { CalendarService } from '@/modules/calendar/calendar.service';
import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';

/**
 * Public iCal subscription feed. No session — auth is the unguessable token in the path.
 * Excluded from Swagger/Orval because it returns a raw `text/calendar` body, not a typed
 * DTO. Calendar clients (Apple/Google) poll this URL; an unknown/revoked token 404s.
 *
 * The `:token` param arrives WITH the `.ics` suffix (e.g. `abc123.ics`); we strip it before
 * lookup so the subscribe URL ends in `.ics` (some clients require the extension).
 */
@ApiExcludeController()
@Controller('calendar/ical')
export class CalendarIcalController {
	constructor(private readonly calendar: CalendarService) {}

	@SkipThrottle()
	@Get(':token')
	@Header('Content-Type', 'text/calendar; charset=utf-8')
	async feed(@Param('token') token: string, @Res({ passthrough: true }) response: Response): Promise<string> {
		const cleanToken = token.endsWith('.ics') ? token.slice(0, -'.ics'.length) : token;
		const body = await this.calendar.renderFeed(cleanToken);
		response.setHeader('Content-Disposition', 'inline; filename="offertum.ics"');
		return body;
	}
}
```

- [ ] **Step 3: Write the module**

```ts
// apps/api/src/modules/calendar/calendar.module.ts
import { CalendarIcalController } from '@/modules/calendar/calendar-ical.controller';
import { CalendarController } from '@/modules/calendar/calendar.controller';
import { CalendarRepository } from '@/modules/calendar/calendar.repository';
import { CalendarService } from '@/modules/calendar/calendar.service';
import { Module } from '@nestjs/common';

/**
 * W12 — Offerte calendar. Projects opportunity/quote/reply-draft dates into calendar events
 * (no persisted table) for an authenticated JSON read + a public token-auth iCal feed.
 */
@Module({
	controllers: [CalendarController, CalendarIcalController],
	providers: [CalendarService, CalendarRepository]
})
export class CalendarModule {}
```

- [ ] **Step 4: Register in `app.module.ts`**

Add the import near the other module imports (alphabetical, after `BillingModule`):

```ts
import { CalendarModule } from '@/modules/calendar/calendar.module';
```

And add `CalendarModule,` to the `imports` array (after `BillingModule,`).

- [ ] **Step 5: Write the feed-controller test**

```ts
// apps/api/src/modules/calendar/calendar-ical.controller.spec.ts
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { CalendarIcalController } from './calendar-ical.controller';
import type { CalendarService } from './calendar.service';

function makeResponse(): Response {
	return { setHeader: jest.fn() } as unknown as Response;
}

describe('CalendarIcalController.feed', () => {
	let renderFeed: jest.Mock;
	let controller: CalendarIcalController;

	beforeEach(() => {
		renderFeed = jest.fn();
		controller = new CalendarIcalController({ renderFeed } as unknown as CalendarService);
	});

	it('strips the .ics suffix before lookup and returns the body', async () => {
		renderFeed.mockResolvedValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
		const body = await controller.feed('abc123.ics', makeResponse());
		expect(renderFeed).toHaveBeenCalledWith('abc123');
		expect(body).toContain('BEGIN:VCALENDAR');
	});

	it('propagates NotFound for an unknown token', async () => {
		renderFeed.mockRejectedValue(new NotFoundException());
		await expect(controller.feed('nope.ics', makeResponse())).rejects.toBeInstanceOf(NotFoundException);
	});
});
```

- [ ] **Step 6: Run the full calendar suite + verify wiring compiles**

Run: `cd apps/api && pnpm exec jest src/modules/calendar src/lib/calendar`
Expected: PASS (all calendar specs green).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/calendar/calendar.controller.ts apps/api/src/modules/calendar/calendar-ical.controller.ts apps/api/src/modules/calendar/calendar.module.ts apps/api/src/modules/calendar/calendar-ical.controller.spec.ts apps/api/src/app.module.ts
git commit -m "feat(calendar): add calendar controllers + module, register in app"
```

---

## Task 11: Add FullCalendar dependency

**Files:**
- Modify: `apps/web/package.json` (via pnpm)

- [ ] **Step 1: Install the approved FullCalendar packages**

Run (from repo root):
```bash
pnpm --filter @offertum/web add @fullcalendar/react @fullcalendar/core @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/list
```
Expected: all five resolve (MIT) and land in `apps/web/package.json` dependencies.

- [ ] **Step 2: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "build(web): add FullCalendar (react/daygrid/timegrid/list) for the calendar view"
```

---

## Task 12: Web — calendar utils (TDD) + api handlers + queries

**Files:**
- Create: `apps/web/src/lib/utils/calendar.utils.ts`
- Test: `apps/web/src/lib/utils/calendar.utils.test.ts`
- Create: `apps/web/src/lib/api/calendar.api.ts`
- Create: `apps/web/src/lib/queries/calendar.queries.ts`

- [ ] **Step 1: Write the failing util test**

```ts
// apps/web/src/lib/utils/calendar.utils.test.ts
import { describe, expect, it } from 'vitest';
import { CALENDAR_EVENT_TYPES } from '@offertum/shared';
import { calendarEventColor, calendarEventLabel } from './calendar.utils';

describe('calendar.utils', () => {
	it('returns a distinct color for every event type', () => {
		const colors = CALENDAR_EVENT_TYPES.map(calendarEventColor);
		expect(new Set(colors).size).toBe(CALENDAR_EVENT_TYPES.length);
	});

	it('returns a Dutch label for every event type', () => {
		expect(calendarEventLabel('sent')).toBe('Offerte verstuurd');
		expect(calendarEventLabel('expiry')).toBe('Offerte verloopt');
		expect(calendarEventLabel('appointment')).toBe('Afspraak');
		expect(calendarEventLabel('deadline')).toBe('Deadline klant');
		expect(calendarEventLabel('follow_up')).toBe('Opvolging');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/lib/utils/calendar.utils.test.ts`
Expected: FAIL — cannot resolve `./calendar.utils`.

- [ ] **Step 3: Write the util**

```ts
// apps/web/src/lib/utils/calendar.utils.ts
import type { CalendarEventType } from '@offertum/shared';

const COLORS: Record<CalendarEventType, string> = {
	sent: '#1976d2', // blue
	expiry: '#d32f2f', // red
	appointment: '#2e7d32', // green
	deadline: '#ed6c02', // orange
	follow_up: '#7b1fa2' // purple
};

const LABELS: Record<CalendarEventType, string> = {
	sent: 'Offerte verstuurd',
	expiry: 'Offerte verloopt',
	appointment: 'Afspraak',
	deadline: 'Deadline klant',
	follow_up: 'Opvolging'
};

export function calendarEventColor(type: CalendarEventType): string {
	return COLORS[type];
}

export function calendarEventLabel(type: CalendarEventType): string {
	return LABELS[type];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/lib/utils/calendar.utils.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the api handlers**

```ts
// apps/web/src/lib/api/calendar.api.ts
import { serverFetch } from '@/lib/api/server-fetch';
import type { CalendarEvent, CalendarEventScope, IcalFeed } from '@offertum/shared';
import { createServerFn } from '@tanstack/react-start';

export interface ListCalendarEventsInput {
	from: string; // ISO
	to: string; // ISO
	scope: CalendarEventScope;
}

/** GET /api/calendar/events — isomorphic SSR + client read for FullCalendar. */
export const listCalendarEventsServer = createServerFn({ method: 'GET' })
	.inputValidator((data: ListCalendarEventsInput) => data)
	.handler(async ({ data }): Promise<CalendarEvent[]> => {
		const params = new URLSearchParams({ from: data.from, to: data.to });
		if (data.scope !== 'all') {
			params.set('scope', data.scope);
		}
		const response = await serverFetch(`/api/calendar/events?${params.toString()}`);
		if (!response.ok) {
			throw new Error(`Failed to load calendar events (${response.status})`);
		}
		return (await response.json()) as CalendarEvent[];
	});

/** GET /api/calendar/ical/token — current feed URL (null when disabled). */
export const getCalendarFeedServer = createServerFn({ method: 'GET' }).handler(async (): Promise<IcalFeed> => {
	const response = await serverFetch('/api/calendar/ical/token');
	if (!response.ok) {
		throw new Error(`Failed to load calendar feed (${response.status})`);
	}
	return (await response.json()) as IcalFeed;
});
```

- [ ] **Step 6: Write the queries + token mutations**

```ts
// apps/web/src/lib/queries/calendar.queries.ts
import { api } from '@/lib/api/client';
import { getCalendarFeedServer, listCalendarEventsServer } from '@/lib/api/calendar.api';
import type { CalendarEventScope, IcalFeed } from '@offertum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

export const CalendarKeys = {
	all: ['calendar'] as const,
	events: (from: string, to: string, scope: CalendarEventScope) => ['calendar', 'events', { from, to, scope }] as const,
	feed: ['calendar', 'feed'] as const
};

/** Events for a visible window + scope. Short staleTime — fresh quotes/appointments surface fast. */
export const calendarEventsQueryOptions = (from: string, to: string, scope: CalendarEventScope) =>
	queryOptions({
		queryKey: CalendarKeys.events(from, to, scope),
		queryFn: () => listCalendarEventsServer({ data: { from, to, scope } }),
		staleTime: 15_000
	});

export const calendarFeedQueryOptions = queryOptions({
	queryKey: CalendarKeys.feed,
	queryFn: () => getCalendarFeedServer()
});

export function useGenerateCalendarFeed() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api<IcalFeed>('/api/calendar/ical/token', { method: 'POST' }),
		onSuccess: feed => queryClient.setQueryData<IcalFeed>(CalendarKeys.feed, feed)
	});
}

export function useRevokeCalendarFeed() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api<void>('/api/calendar/ical/token', { method: 'DELETE' }),
		onSuccess: () => queryClient.setQueryData<IcalFeed>(CalendarKeys.feed, { url: null })
	});
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/utils/calendar.utils.ts apps/web/src/lib/utils/calendar.utils.test.ts apps/web/src/lib/api/calendar.api.ts apps/web/src/lib/queries/calendar.queries.ts
git commit -m "feat(web): add calendar utils, api handlers, and queries"
```

---

## Task 13: Web — calendar route (FullCalendar)

**Files:**
- Create: `apps/web/src/routes/(app)/calendar/index.tsx`

- [ ] **Step 1: Write the route**

```tsx
// apps/web/src/routes/(app)/calendar/index.tsx
import { listCalendarEventsServer } from '@/lib/api/calendar.api';
import { calendarEventsQueryOptions, CalendarKeys } from '@/lib/queries/calendar.queries';
import { calendarEventColor, calendarEventLabel } from '@/lib/utils/calendar.utils';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { CALENDAR_EVENT_SCOPES, type CalendarEventScope } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';

// Visible window the loader prefetches. FullCalendar then refetches via the events query
// as the user navigates months; the route keeps a wide static window so first paint is full.
const WINDOW_PAST_DAYS = 60;
const WINDOW_FUTURE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

function windowRange(): { from: string; to: string } {
	const now = Date.now();
	return {
		from: new Date(now - WINDOW_PAST_DAYS * DAY_MS).toISOString(),
		to: new Date(now + WINDOW_FUTURE_DAYS * DAY_MS).toISOString()
	};
}

const SearchSchema = z.object({
	scope: z.enum(CALENDAR_EVENT_SCOPES).optional()
});

export const Route = createFileRoute('/(app)/calendar/')({
	validateSearch: SearchSchema,
	loaderDeps: ({ search }) => ({ scope: search.scope ?? 'all' }),
	loader: ({ context, deps }) => {
		const { from, to } = windowRange();
		return context.queryClient.ensureQueryData(calendarEventsQueryOptions(from, to, deps.scope));
	},
	component: CalendarPage
});

function CalendarPage() {
	const { scope } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const activeScope: CalendarEventScope = scope ?? 'all';
	const { from, to } = windowRange();
	const { data: events } = useSuspenseQuery(calendarEventsQueryOptions(from, to, activeScope));

	// FullCalendar is a client-only widget (it touches the DOM and reads window size for the
	// responsive view). Gate its render behind a mounted flag so SSR emits no calendar markup
	// and there's no hydration mismatch. Data is already SSR-prefetched via the loader, so this
	// only defers the calendar chrome, not the fetch.
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);
	const initialView = mounted && window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth';

	const fcEvents = events.map(event => ({
		id: event.id,
		title: event.title,
		start: event.at,
		allDay: event.allDay,
		backgroundColor: calendarEventColor(event.type),
		borderColor: calendarEventColor(event.type),
		extendedProps: { opportunityId: event.opportunityId, type: event.type }
	}));

	return (
		<Container sx={{ py: 3 }}>
			<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
				<Typography variant='h1' sx={{ fontSize: 28 }}>
					Agenda
				</Typography>
				<FormControlLabel
					control={
						<Switch
							checked={activeScope === 'mine'}
							onChange={(_, checked) =>
								navigate({ search: prev => ({ ...prev, scope: checked ? 'mine' : undefined }), replace: true })
							}
						/>
					}
					label='Aan mij toegewezen'
				/>
			</Box>
			{mounted ? (
				<FullCalendar
					plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
					initialView={initialView}
					headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' }}
					locale='nl'
					firstDay={1}
					height='auto'
					events={fcEvents}
					eventClick={info => {
						const opportunityId = info.event.extendedProps.opportunityId as string;
						void navigate({ to: '/opportunities/$id', params: { id: opportunityId } });
					}}
				/>
			) : null}
		</Container>
	);
}
```

> Why `listCalendarEventsServer` is imported even though the component reads via the query:
> the `loader` uses the queryOptions (which call it under the hood); keeping the import makes
> the data dependency explicit and matches the opportunities route. If the linter flags it as
> unused, drop the import — the queryOptions already reference the server fn.

- [ ] **Step 2: Verify typecheck + the route compiles**

Run: `cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep "calendar/index" || echo "no calendar route type errors"`
Expected: `no calendar route type errors`.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/routes/(app)/calendar/index.tsx"
git commit -m "feat(web): add FullCalendar agenda route with mine/all scope toggle"
```

---

## Task 14: Web — iCal feed settings page

**Files:**
- Create: `apps/web/src/routes/(app)/settings/calendar.tsx`

- [ ] **Step 1: Write the settings page**

```tsx
// apps/web/src/routes/(app)/settings/calendar.tsx
import { BackToHomeButton } from '@/components/BackToHomeButton.component';
import {
	calendarFeedQueryOptions,
	useGenerateCalendarFeed,
	useRevokeCalendarFeed
} from '@/lib/queries/calendar.queries';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(app)/settings/calendar')({
	loader: ({ context }) => context.queryClient.ensureQueryData(calendarFeedQueryOptions),
	component: CalendarSettingsPage
});

function CalendarSettingsPage() {
	const { data: feed } = useSuspenseQuery(calendarFeedQueryOptions);
	const generate = useGenerateCalendarFeed();
	const revoke = useRevokeCalendarFeed();

	return (
		<Container sx={{ py: 3, maxWidth: 640 }}>
			<BackToHomeButton />
			<Typography variant='h1' sx={{ fontSize: 28, mt: 2, mb: 1 }}>
				Agenda-abonnement
			</Typography>
			<Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
				Abonneer je agenda-app (Apple Agenda, Google Calendar) op deze link om je offertes,
				deadlines en afspraken automatisch te zien.
			</Typography>

			<Alert severity='warning' sx={{ mb: 3 }}>
				Iedereen met deze link kan je agenda-items zien (klantnaam + type aanvraag). Deel hem
				niet en vernieuw de link als je hem per ongeluk hebt gedeeld.
			</Alert>

			{feed.url ? (
				<Stack spacing={2}>
					<TextField
						label='Abonnement-URL'
						value={feed.url}
						slotProps={{ input: { readOnly: true } }}
						fullWidth
						onFocus={event => event.target.select()}
					/>
					<Stack direction='row' spacing={2}>
						<Button variant='outlined' onClick={() => void navigator.clipboard.writeText(feed.url ?? '')}>
							Kopiëren
						</Button>
						<Button variant='outlined' onClick={() => generate.mutate()} disabled={generate.isPending}>
							Vernieuwen
						</Button>
						<Button color='error' variant='outlined' onClick={() => revoke.mutate()} disabled={revoke.isPending}>
							Intrekken
						</Button>
					</Stack>
				</Stack>
			) : (
				<Button variant='contained' onClick={() => generate.mutate()} disabled={generate.isPending}>
					Abonnement aanmaken
				</Button>
			)}
		</Container>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/routes/(app)/settings/calendar.tsx"
git commit -m "feat(web): add iCal feed subscription settings page"
```

---

## Task 15: Web — nav entries on the home dashboard

**Files:**
- Modify: `apps/web/src/routes/(app)/index.tsx`

- [ ] **Step 1: Add an "Agenda" button next to the opportunities button**

In `apps/web/src/routes/(app)/index.tsx`, after the existing opportunities button:

```tsx
<Button variant='contained' onClick={() => navigate({ to: '/opportunities' })}>
```

add:

```tsx
<Button variant='contained' onClick={() => navigate({ to: '/calendar' })}>
	Agenda
</Button>
```

- [ ] **Step 2: Add an "Agenda-abonnement" settings button**

After the `/settings/follow-ups` button in the same file, add:

```tsx
<Button variant='outlined' onClick={() => navigate({ to: '/settings/calendar' })}>
	Agenda-abonnement
</Button>
```

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/routes/(app)/index.tsx"
git commit -m "feat(web): add Agenda + Agenda-abonnement nav buttons"
```

---

## Task 16: Full verification

**Files:** none (verification only)

- [ ] **Step 1: API tests**

Run: `cd apps/api && pnpm exec jest src/modules/calendar src/lib/calendar`
Expected: all calendar specs PASS.

- [ ] **Step 2: Full API + web test suites**

Run (repo root): `pnpm test`
Expected: full suite green (no regressions in opportunities/billing/etc.).

- [ ] **Step 3: Typecheck both apps**

Run (repo root): `pnpm --filter @offertum/shared build && pnpm typecheck`
Expected: PASS. (If `quoteValidityDays`/`icalFeedToken` errors appear, the user has not run `pnpm db:generate` — STOP and ask.)

- [ ] **Step 4: Lint + format**

Run (repo root): `pnpm lint && pnpm format`
Expected: clean (fix any reported issues before finishing).

- [ ] **Step 5: Manual smoke (note for the user, not automated)**

> Manual check the user runs: start `pnpm dev`, open `/calendar` (events render, click → opportunity detail, "Aan mij toegewezen" toggle filters), then `/settings/calendar` → "Abonnement aanmaken" → copy the `.ics` URL → `curl <url>` returns a `BEGIN:VCALENDAR` body → subscribe in Apple/Google Calendar and confirm events appear (W12.4 AC).

- [ ] **Step 6: Final commit (if lint/format changed anything)**

```bash
git add -A
git commit -m "chore(calendar): lint + format pass"
```

---

## Self-review notes (coverage map)

- **W12.1 OfferteEvent model** → replaced by projection (D1): Tasks 3–4 (mapper) + Task 7 (repository sources).
- **W12.2 backfill** → dissolved by D1 (no table). Explicitly out.
- **W12.3 FullCalendar** → Tasks 11, 13 (month/week/list; click→detail; `<768px` list view; mine/all toggle).
- **W12.4 iCal feed** → Tasks 5 (serializer), 9–10 (render + token endpoints), 12 (token mutations), 14 (settings UI). Per-user revocable signed token (`User.icalFeedToken`).
- **Spec §expiry (quoteValidityDays)** → Task 1 + mapper expiry math (Task 4).
- **Spec §scope (mine/all)** → repository filter (Task 7), service plumb (Task 9), route toggle (Task 13). Feed = whole org (Task 9 `renderFeed`).
- **Schema/process constraint** → Task 1 stops for the user to run Prisma; Tasks 7 & 16 re-check that the client was generated.
