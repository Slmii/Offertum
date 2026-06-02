# W12 — Offerte Calendar — Design

**Date:** 2026-06-02
**Status:** Approved for planning
**Build-plan ref:** `~/.claude/plans/toasty-herding-giraffe.md` → Phase 4, W12.1–W12.4 (D33)

## Problem / use case

The Dutch SMB owner runs their day from their phone's calendar, not from a CRM dashboard.
Offertum already extracts the revenue-critical dates — quote sent, customer deadline,
requested appointment, follow-up due — but they are trapped inside opportunity detail
pages where the owner never looks. The result: quotes silently expire and appointments
get missed, losing deals by default rather than by losing.

W12 surfaces those dates in two places the owner *does* look:

1. An in-app calendar (month / week / agenda views).
2. A per-user iCal subscription feed, so the dates appear natively in Apple/Google
   Calendar alongside their job appointments — on their phone, no app to open.

W13 (out of scope here) layers AI prioritization on top; W12 only renders the dates.

## Scope

In scope: all four W12 sub-tasks — data layer, in-app FullCalendar view, and the per-user
iCal feed. The W12.2 backfill **dissolves** because events are projected on read (see below),
so there is nothing to backfill.

Out of scope (W13): daily AI digest, ranking algorithm, smart-expiry `ExpiryAction` cards,
pattern-detection banners.

## Key design decisions

### D1 — Events are projected on read, not persisted

No `OfferteEvent` table. A pure function maps the *current* `Opportunity` + `QuoteDraft`
rows to calendar events at query time.

Rationale: every source date already lives on a row the owner can edit (reschedule an
appointment, change a deadline, send/resend a quote). A persisted event table would require
write-on-create **plus** update-on-edit **plus** delete-on-clear hooks scattered across
every date-mutating path — easy to miss, and any miss silently drifts the calendar from
reality. Projection is always consistent by construction, needs no backfill, and is trivially
fast at MVP scale (hundreds–low-thousands of opps per org). The trade-off given up — hanging
per-event state (e.g. "this reminder was dismissed") off an event row — is not needed: W12
events are read-only markers. (W13's smart-expiry state lives in its own `ExpiryAction` table.)

### D2 — Five event types (plan listed four)

Added `appointment` beyond the plan's `sent | follow_up | customer_deadline | expiry`, because
`Opportunity.customerAppointment` is an actual scheduled site visit — the single most
calendar-worthy date we extract. Renamed `customer_deadline` → `deadline` for brevity.

| Type | Source | Time semantics | Shown when |
|------|--------|----------------|------------|
| `sent` | `QuoteDraft.sentAt` | timed | quote draft has been sent |
| `expiry` | `QuoteDraft.sentAt + org.quoteValidityDays` | all-day | quote draft has been sent |
| `appointment` | `Opportunity.customerAppointment` | timed | field is non-null |
| `deadline` | `Opportunity.customerDeadline` | all-day | field is non-null |
| `follow_up` | latest SENT reply-draft `sentAt + org.followUpCadenceDays` | all-day | opp is `REPLIED`, not dismissed, prior CHECK_IN count `< org.followUpMaxCount` |

Dismissed opportunities (`dismissedAt IS NOT NULL`) and all their events are always excluded.

### D3 — Quote expiry window is org-configurable

Add `Organization.quoteValidityDays Int @default(30)` (same shape as `followUpCadenceDays`
/ `coldAfterDays`). `expiry = quoteDraft.sentAt + quoteValidityDays`. No per-quote column.
Owner-configurable on a settings page (this build wires the column + default; a settings
control can follow). Pairs naturally with printing "geldig tot" on the quote PDF in a later
week — not in this build.

### D4 — Hand-rolled iCal serializer (no dependency)

iCal (RFC 5545) is a simple line-oriented text format. We hand-roll a `VCALENDAR`/`VEVENT`
serializer in `lib/calendar/ical-serializer.ts`, mirroring the existing
`lib/email/rfc2822-reply.ts` "no dependency for a simple wire format" choice. No `ics` npm
package added on the API side.

### D5 — FullCalendar for the in-app view (approved dependency)

Web app pulls in FullCalendar React (MIT): `@fullcalendar/react`, `@fullcalendar/core`,
`@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/list`. The premium/resource
plugins are **not** used. Building a month/week/agenda calendar by hand is not worth it; this
is the one place a dependency earns its keep. The `list` plugin provides the mobile agenda
view that satisfies the `<768px` acceptance criterion.

### D6 — Event scope: whole org, with a "mine" filter

Default = every active (non-dismissed) opportunity in the org — matches the solo-owner reality
and the opportunities list's `owner=all` default. The in-app calendar exposes a
"Aan mij toegewezen" toggle reusing the existing `assignedToUserId` dimension. The iCal feed
shows the whole org (a subscribed feed has no UI to toggle; whole-org is the safe default so
nothing falls through the cracks — the opposite outcome would defeat the use case).

## Schema changes (user runs the migration + client generation)

```prisma
// model Organization
quoteValidityDays Int @default(30)
// Quote expiry window: a sent quote is treated as valid for this many days
// (drives the calendar `expiry` event = QuoteDraft.sentAt + quoteValidityDays).
// 30-day default mirrors followUpCadenceDays/coldAfterDays. Owner-configurable.

// model User
icalFeedToken String? @unique
// Per-user secret for the iCal subscription feed (/api/calendar/ical/:token.ics).
// NULL = feed disabled. Generated on first enable; regenerate to rotate (invalidates
// the old URL); set NULL to revoke. 32-byte base64url, high-entropy, unguessable.
```

**Note (process):** Per standing instruction, Claude does NOT run any Prisma command. After
the `schema.prisma` edit, Claude stops and hands the user the exact commands
(`pnpm db:migrate`, then `pnpm db:generate`). Code that depends on the regenerated client
will not typecheck until the user runs these — that is expected and called out, not worked
around.

## API — new `calendar` module

```
apps/api/src/modules/calendar/
  calendar.module.ts
  calendar.controller.ts            # authenticated event reads + feed-token management (in OpenAPI)
  calendar-ical.controller.ts       # public token-auth feed ONLY (@ApiExcludeController)
  calendar.service.ts               # orchestrates repository read → mapper
  calendar.repository.ts            # Prisma reads for active opps in a date window
  calendar-event.mapper.ts          # PURE: rows + org config → CalendarEvent[]
  calendar-event-type.ts            # type union + per-type metadata (label, all-day flag)
  dto/
    calendar-event.response.dto.ts  # CalendarEventDto (class, for OpenAPI/Orval)
    ical-feed.response.dto.ts       # { url: string | null }  (token status / after rotate)

apps/api/src/lib/calendar/
  ical-serializer.ts                # hand-rolled VCALENDAR/VEVENT builder
```

### Endpoints

| Method | Path | Guard | Returns |
|--------|------|-------|---------|
| GET | `/api/calendar/events?from&to&scope=mine\|all` | `OrganizationGuard` | `CalendarEventDto[]` |
| GET | `/api/calendar/ical/token` | `OrganizationGuard` | `IcalFeedResponseDto` (current url or null) |
| POST | `/api/calendar/ical/token` | `OrganizationGuard` | `IcalFeedResponseDto` (generate/rotate) |
| DELETE | `/api/calendar/ical/token` | `OrganizationGuard` | 204 (revoke → token NULL) |
| GET | `/api/calendar/ical/:token.ics` | none (token-auth) | `text/calendar` body |

The event read + the three token-management endpoints live on `calendar.controller.ts` so
they appear in the OpenAPI spec and Orval generates web-client types. Only the public feed
(`GET /:token.ics`) lives on `calendar-ical.controller.ts`, which is `@ApiExcludeController`
(mirroring the webhook controllers — it serves a raw `text/calendar` body, not a typed DTO).

- `from`/`to` are ISO timestamps bounding the visible range FullCalendar requests; the
  repository filters to opportunities/quote-drafts whose relevant date falls in `[from, to]`.
- The feed is looked up by the `@unique` `icalFeedToken`;
  an unknown/revoked token returns 404. Feed renders a rolling window (e.g. −30d … +180d) so
  subscribed clients always see near-term events without unbounded payloads.

### Mapper contract (the testable core)

```ts
// calendar-event.mapper.ts — pure, no I/O
interface CalendarEventSource {
  opportunity: {
    id, status, dismissedAt, customerName, customerDeadline, customerAppointment,
    assignedToUserId,
  };
  sentQuoteDrafts: { id, sentAt }[];          // QuoteDrafts with sentAt != null
  latestSentReplyDraftAt: Date | null;        // for follow_up
  priorCheckInCount: number;                  // CHECK_IN drafts already generated
}
interface OrgCalendarConfig { quoteValidityDays; followUpCadenceDays; followUpMaxCount }

function toCalendarEvents(src: CalendarEventSource, cfg: OrgCalendarConfig): CalendarEvent[]
```

Returns `[]` for dismissed opps. Each `CalendarEvent` carries `{ id, opportunityId, type,
title, at, allDay }` where `id` is a deterministic synthetic key (`${opportunityId}:${type}`
or `${quoteDraftId}:${type}`) so React/FullCalendar keys are stable across refetches and the
iCal `UID` is stable across feed pulls (no duplicate-event churn in subscribers' calendars).

## Shared types

```
apps/shared/src/calendar.ts
```
```ts
export type CalendarEventType = 'sent' | 'expiry' | 'appointment' | 'deadline' | 'follow_up';
export type CalendarEventScope = 'mine' | 'all';
export interface CalendarEvent {
  id: string;
  opportunityId: string;
  type: CalendarEventType;
  title: string;
  at: string;          // ISO
  allDay: boolean;
}
```

## Web

```
apps/web/src/routes/(app)/calendar/index.tsx     # FullCalendar route (lazy)
apps/web/src/routes/(app)/settings/calendar.tsx  # iCal subscription management
apps/web/src/lib/api/calendar.api.ts             # createServerFn handlers
apps/web/src/lib/queries/calendar.queries.ts     # queryOptions + token mutations
apps/web/src/lib/utils/calendar.utils.ts         # type → color + Dutch label
```

- Route uses `validateSearch` (Zod) to persist `scope` (+ active view/date) to the URL;
  `loaderDeps` declares the params that re-trigger prefetch; `loader` →
  `ensureQueryData`; component reads via `useSuspenseQuery`. FullCalendar renders client-side,
  so there is no SSR locale-mismatch hazard, but all incidental date text still goes through
  the `nl-NL` helpers in `lib/utils/date.utils.ts`.
- Events color-coded by type with Dutch labels; clicking an event navigates to
  `/opportunities/$id`. Month + week + list (agenda) views; list view auto-selected below
  768px.
- Settings page shows the feed URL, a copy button, and **Aanmaken / Vernieuwen / Intrekken**
  actions (token mutations via the relative-URL `api()` client, invalidating the token query),
  plus a clear "anyone with this link can read your agenda" warning.
- "Agenda" link added to the authenticated app nav.

## Testing

**API (jest):**
- `calendar-event.mapper.spec.ts` — every event type; expiry arithmetic; follow-up
  eligibility + cap boundary; dismissed-opp exclusion; missing-date cases; stable synthetic ids.
- `ical-serializer.spec.ts` — 75-octet line folding, text escaping (`,` `;` `\` newline),
  all-day (`VALUE=DATE`) vs timed `DTSTART`, well-formed `VCALENDAR`/`VEVENT` envelope, stable `UID`.
- `calendar-ical.controller.spec.ts` — valid token serves feed; unknown/revoked token → 404.
- `calendar.service.spec.ts` — repository mocked; scope filter + window plumbed correctly.

**Web (vitest):**
- `calendar.utils.test.ts` — type → color/label mapping.
- queryOptions key shape (from/to/scope).
- FullCalendar render is integration-level, not unit-tested.

## Risks / notes

- **Follow-up event accuracy** is the most complex projection (depends on latest SENT
  reply-draft timestamp + prior CHECK_IN count). The repository must surface those two fields
  per opp so the mapper stays pure. If the read becomes expensive, it can be narrowed to
  `REPLIED` opps only at the query level.
- **iCal feed is a bearer-secret URL** — unguessable token, revocable by rotation, 404 on
  unknown. No customer PII beyond event titles (customer name + request type) is exposed; the
  settings warning makes the sharing model explicit.
- **Typecheck depends on the user-run migration** — code touching `quoteValidityDays` /
  `icalFeedToken` will not compile until `pnpm db:migrate` + `pnpm db:generate` are run by the
  user. This is expected and surfaced, never worked around by Claude running Prisma.
