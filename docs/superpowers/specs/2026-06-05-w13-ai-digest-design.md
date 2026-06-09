# W13 — Daily AI Digest + Smart Expiry + Pattern Detection — Design

**Date:** 2026-06-05
**Status:** Approved for planning
**Build-plan ref:** `~/.claude/plans/toasty-herding-giraffe.md` → Phase 4, W13.1–W13.5 (D33)

## Problem / use case

Offertum already collects the revenue-critical signals — quote value, customer reply
timing, validity windows, follow-up state — but it treats every open opportunity equally.
The Dutch SMB owner has no help answering the only question that matters each morning:
**"which quotes should I chase today, and which are about to slip away?"** Quotes expire
silently, valuable leads get the same attention as throwaway ones, and the owner has no
visibility into their own response-time patterns.

W13 adds a **prioritization intelligence layer** on top of the existing data. Like W12's
calendar, it is read-side projection plus scheduled nudges — it does **not** change how
opportunities or quotes are created. Four building blocks:

1. **Ranking engine** — a pure, documented function that scores open opportunities by
   `expectedValue × winProbability × timePressure`.
2. **Daily digest email** — a 07:30 per-user email listing the top-ranked opportunities and
   expiring quotes, coexisting with (and independently toggleable from) the weekly digest.
3. **Smart expiry actions** — when a quote nears expiry without a reply, an AI-tailored
   action card (`extend 14d | last reminder | mark lost`) surfaces on the opportunity detail
   page and in the digest.
4. **Pattern detection banners** — two dashboard insights about reply time and win rate,
   gated to orgs with enough history.

## Scope

In scope: all five W13 sub-tasks (W13.1–W13.5), built as four phases (A–D below).

Out of scope: per-vertical baseline *learning* from live data (v1 uses a static baseline
table seeded by trade); Slack/Teams digest channels (post-MVP per the notification enum);
the owner metrics dashboard (W14c).

## Key design decisions

### D1 — `Organization.vertical` is a required enum, seeding win-rate baselines

`winProbability` and pattern detection both need a trade baseline, but no vertical/industry
field exists anywhere in the schema (it was slated for the deferred onboarding wizard, W8.1).

We add `Organization.vertical Vertical @default(OVERIG)` — a **required** field (no null),
backfilled to `OVERIG` for existing orgs, editable in the business-details settings page
next to `quoteValidityDays`. The enum:

| Value | Trade (NL) | Baseline win-prob (v1) |
|-------|-----------|------------------------|
| `LOODGIETER` | plumber | 0.40 |
| `ELEKTRICIEN` | electrician | 0.38 |
| `SCHILDER` | painter | 0.25 |
| `TIMMERMAN` | carpenter / contractor | 0.30 |
| `DAKDEKKER` | roofer | 0.35 |
| `TEGELZETTER` | tiler | 0.28 |
| `HOVENIER` | gardener / landscaper | 0.30 |
| `INSTALLATEUR` | HVAC / installation | 0.42 |
| `SCHOONMAAK` | cleaning | 0.33 |
| `OVERIG` | other (default) | 0.30 |

Baselines are a **documented constant table** in code, not learned. They are deliberately
coarse priors — the ranking's value is the *relative ordering within an org*, which the
response-time and follow-up modifiers (below) drive far more than the vertical prior does.
The table is the natural seam to replace with org-history-derived baselines post-MVP without
touching the ranking formula.

### D2 — Events/scores are projected on read; only `ExpiryAction` is persisted

Consistent with W12's D1. The ranking is computed at digest time from current rows — no
`RankedOpportunity` table, no drift. The **only** new persisted state is `ExpiryAction`,
because an expiry suggestion *does* have hanging state the owner mutates (taken / dismissed)
and the watcher cron must be idempotent against it.

### D3 — Ranking formula

A pure function `rankOpportunities(opps, cfg) → RankedOpportunity[]`:

```
priority = expectedValue × winProbability × timePressure
```

- **`expectedValue`** = sum of the latest `QuoteDraft`'s line items, **net of VAT**
  (`Σ quantity × unitPriceEur`), or `0` when no quote is drafted yet. VAT is pass-through,
  not the business's revenue, so net is the honest "what this deal is worth to me" figure.
  A no-quote opportunity still ranks via `winProbability × timePressure` (it just carries no
  value term), so genuinely urgent un-quoted leads are not buried.
- **`winProbability`** = `verticalBaseline[org.vertical] × responseTimeModifier ×
  followUpCountModifier`, clamped to `[0.02, 0.95]`.
  - `responseTimeModifier`: > 1 when the org replied fast to this opp, < 1 when slow
    (piecewise on hours-to-first-reply).
  - `followUpCountModifier`: decays toward 1.0 → 0.6 → 0.35 as unanswered follow-ups
    accumulate (`priorCheckInCount`).
- **`timePressure`** = a monotonic function of the *soonest* relevant deadline among the
  quote's `validUntil`, the `customerDeadline`, and the next follow-up due date. Closer →
  higher (e.g. ≤ 2 days → 2.0, ≤ 5 → 1.5, ≤ 14 → 1.1, else 1.0).

The exact piecewise breakpoints live in code comments per the W13.1 AC. The function is
side-effect-free and unit-tested: a fixture set produces a stable ordering, and shrinking
one opp's expiry to 2 days bubbles it upward (the AC).

Location: `apps/api/src/modules/digest/ranking.ts` (pure, no I/O). Value summing is a small
helper `quoteNetValue(quoteDraft)` co-located, also pure and tested.

### D4 — Daily digest coexists with the weekly digest, both per-user toggleable

Add `NotificationEventType.DAILY_DIGEST`. The existing `WEEKLY_DIGEST` stays. Because the
`NotificationPreference` table is already per-user × per-event-type × per-channel with an
`enabled` flag, the daily/weekly on-off toggles require **no new preference plumbing** — the
existing notification-settings UI renders the new event row automatically.

`DailyDigestFunction` (new Inngest cron, `TZ=Europe/Amsterdam 30 7 * * *` → 07:30, using
`BUSINESS_TIME_ZONE`) runs *after* the 06:30 expiry watcher and the existing 07:00 auto-cold
scheduler, so it reflects a settled snapshot. Per org it:

1. loads open opportunities + latest quote/draft state,
2. ranks them (D3),
3. resolves recipients via `NotificationPreference` (same channel resolution as the weekly
   digest) with the same idempotency-window guard against retry double-sends,
4. dispatches an in-app notification + a `daily-digest.email.ts` Resend email.

Email content: up to **5** ranked items (customer, request type, value, why-it-ranks chip),
a **"Verloopt binnenkort"** callout block (quotes with a live `ExpiryAction`), org total open
value, and authenticated "bekijk in app" deep links.

### D5 — Smart expiry: `ExpiryAction` + AI watcher + one-tap actions

New table:

```
ExpiryAction {
  id              uuid pk
  organizationId  uuid  (Cascade)
  opportunityId   uuid  (Cascade)
  quoteDraftId    uuid  (Cascade)
  validUntil      DateTime          // snapshot the action fired against
  status          ExpiryActionStatus @default(SUGGESTED)  // SUGGESTED|TAKEN|DISMISSED|SUPERSEDED
  recommendedAction ExpiryActionKind                       // EXTEND_14D|LAST_FOLLOWUP|MARK_LOST
  suggestedCopy   String @db.Text   // AI-tailored Dutch rationale
  takenAction     ExpiryActionKind? // what the owner actually chose
  aiCallId        uuid?  (SetNull)  // FK to the AICall that produced the copy
  takenById       uuid?  (SetNull)
  createdAt / updatedAt
  @@unique([quoteDraftId, validUntil])   // idempotency root
}
```

`ExpiryWatcherFunction` (new Inngest cron, `TZ=Europe/Amsterdam 30 6 * * *` → 06:30, idempotent):
scans `QuoteDraft`s whose `validUntil` is ~5 days out, that have been sent, with no customer
reply since send, and no live `ExpiryAction` for that `(quoteDraftId, validUntil)`. For each,
it makes **one** `AIClient.generate()` call (`purpose: 'expiry-suggestion'`, `store: false`,
logged via `AICallLogger`) that reads the customer's last message and returns a recommended
action + tailored Dutch copy, then inserts an `ExpiryAction`. Re-running the same day inserts
nothing new (the `@@unique` + the "no live action" filter). If the AI call fails, the row is
not inserted — the next tick retries (same retryable-failure philosophy as the opportunity
pipeline).

Three one-tap actions, each an authenticated `@TenantWrite()` endpoint that flips the
`ExpiryAction` to `TAKEN` (recording `takenAction` + `takenById`) and writes an audit `Log`
row + opportunity timeline event:

- **`extend_14d`** → `QuoteDraft.validUntil += 14d`. Because `validUntil` is the W12 single
  source of truth, this automatically re-drives the PDF "Geldig tot", the calendar `expiry`
  event, and the opp-detail display. Any other live `ExpiryAction` for the opp is marked
  `SUPERSEDED`.
- **`last_followup`** → generates a final reminder through the **existing CHECK_IN reply-draft
  generator** (that path is already AI-written and tone-aware); does not invent a parallel
  generator.
- **`mark_lost`** → opportunity `status → LOST`.

Surface (per Q5): an action card on the opportunity **detail page** + the digest callout.
A dismiss control flips the action to `DISMISSED` (no further surfacing for that window).

### D6 — Pattern detection banners

Two dashboard banners on the authenticated home route, computed server-side from existing
rows (no AI), gated to orgs with **≥ 10 lifetime opportunities**:

- **(a) Reply-speed:** the org's average customer-reply time vs. its configured
  `followUpCadenceDays`.
- **(b) Win-rate-by-speed:** win rate bucketed by the org's own first-response time.

Dismissal persists in a new `PatternDismissal` row keyed by `(organizationId, userId,
patternKey)` with a `dismissedAt`; a pattern re-shows once **30 days** have elapsed since
dismissal. Copy matches the MVP doc examples. Banners are suppressed entirely below the
10-opportunity threshold.

### D7 — Cron schedule (final ordering)

| Time (Europe/Amsterdam) | Job | Status |
|---|---|---|
| 06:30 | Expiry watcher | **new (C)** |
| 07:00 | Auto-cold scheduler | existing |
| 07:30 | Daily digest | **new (B)** |
| 08:00 | Follow-up scheduler | existing |
| Mon 08:00 | Weekly digest | existing |

All new crons use the `BUSINESS_TIME_ZONE` constant.

## Build phases

Independently shippable; B depends on A's ranking; C and D are standalone.

- **Phase A — Ranking engine + vertical.** `Organization.vertical` enum + migration + settings
  field; `ranking.ts` + `quoteNetValue` pure functions (TDD).
- **Phase B — Daily digest.** `DAILY_DIGEST` event type; `DailyDigestFunction` cron;
  `daily-digest.email.ts`; recipient/idempotency reuse from the weekly digest.
- **Phase C — Smart expiry.** `ExpiryAction` table + enums; `ExpiryWatcherFunction` cron +
  expiry-suggestion AICall; three action endpoints; opp-detail action card; digest callout.
- **Phase D — Pattern detection.** `PatternDismissal` table; two server-computed banners;
  ≥10-opp gate + 30-day re-show.

## Critical files

**Schema (USER runs migration — never Claude):** `apps/api/prisma/schema.prisma`
- `enum Vertical`, `Organization.vertical`
- `enum ExpiryActionStatus`, `enum ExpiryActionKind`, `model ExpiryAction`
- `model PatternDismissal`
- `NotificationEventType.DAILY_DIGEST`

**API — new `apps/api/src/modules/digest/`:** `ranking.ts` (+ spec), `quote-value.ts`
(+ spec), `digest.service.ts`, `digest.repository.ts`, `digest.module.ts`.

**API — new `apps/api/src/modules/expiry/`:** `expiry.service.ts`, `expiry.repository.ts`,
`expiry.controller.ts` (three action endpoints + dismiss), `expiry-suggestion.*` (AI prompt +
types), `dto/*`, `expiry.module.ts`.

**API — new Inngest functions:** `daily-digest.function.ts`, `expiry-watcher.function.ts`
(register in `functions/index.ts`).

**API — new email:** `apps/api/src/lib/mails/notifications/daily-digest.email.ts`.

**API — patterns:** `apps/api/src/modules/patterns/` (`patterns.service.ts`,
`patterns.repository.ts`, `patterns.controller.ts`, `dto/*`).

**Shared:** `apps/shared/src/digest.ts`, `apps/shared/src/expiry.ts`,
`apps/shared/src/patterns.ts` (+ exports in `index.ts`).

**Web:**
- expiry action card on the opportunity detail route + `lib/queries/expiry.queries.ts` +
  action mutations.
- pattern banners on `routes/(app)/index.tsx` + `lib/queries/patterns.queries.ts`.
- `Organization.vertical` control in the business-details settings form + schema.
- notification-settings page already renders the new `DAILY_DIGEST` toggle (no change beyond
  copy).

**Modify:** `apps/api/src/lib/errors.ts` (new thrown messages), `apps/api/src/app.module.ts`
(register new modules).

**Reused patterns:** `BUSINESS_TIME_ZONE`; `AIClient` seam + `AICallLogger` (`store: false`);
`NotificationsService.notifyUsers` + `NotificationPreference` resolution; the weekly-digest
idempotency-window guard; the CHECK_IN reply-draft generator; `@TenantWrite()` guard;
controller→DTO-class convention; audit `Log` + opportunity timeline event conventions
(CLAUDE.md #22/#23); AsyncLocalStorage re-entry inside every `step.run` (CLAUDE.md #8);
`UPDATE … RETURNING` race-narrowing for any bulk flips (CLAUDE.md #26).

## Testing & verification

- **Unit (TDD per phase):**
  - `ranking.ts` — stable ordering on a fixture set; expiry → 2 days bubbles an opp up;
    no-quote opp ranks on `winProbability × timePressure`; clamp bounds.
  - `quote-value.ts` — net-of-VAT summing; null/empty handling.
  - expiry watcher — idempotency (re-run inserts zero); the ~5-day + no-reply selection.
  - patterns — ≥10 gate; 30-day re-show window.
- **Live-API (skipped without `OPENAI_API_KEY`):** an expiry-suggestion fixture in the
  accuracy-harness style.
- **Full suite + types + lint:** `pnpm test`, then
  `pnpm --filter @offertum/shared build && pnpm typecheck`, then `pnpm lint && pnpm format`.
- **Manual smoke (user):** time-warp a sent quote to 5-days-out → expiry watcher (Invoke in
  Inngest UI) inserts one `ExpiryAction` with AI copy → card appears on opp detail → tap each
  action (extend re-drives PDF/calendar; last-followup generates a draft; mark-lost flips
  status) + audit row written → re-run watcher creates no duplicate. Toggle daily/weekly
  digest in settings; Invoke the daily digest → top-5 ranked email with the expiry callout.
  Seed ≥10 opps → pattern banners render; dismiss → gone; (verify 30-day re-show via DB date
  backdate).

## Execution method

Subagent-driven (fresh implementer per task + spec-compliance then code-quality review),
on a new `feat/w13-ai-digest` branch. **Phase A task 1 is a hard gate:** Claude edits
`schema.prisma`, then stops for the user to run `cd apps/api && pnpm db:migrate &&
pnpm db:generate` before any code referencing the new fields is built. Subsequent phases each
add their schema delta at the phase boundary with the same migration gate.

**No commits or pushes** — all work stays as open changes for the user to review (per the
user's explicit instruction this session).
