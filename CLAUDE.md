# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Offertum — AI offerte management for Dutch SMBs. Reads inbox + WhatsApp, extracts quote requests, drafts replies in the owner's tone, generates quote PDFs, tracks deadlines / expiry / follow-ups.

Solo 14-week MVP build. The build plan lives at `~/.claude/plans/toasty-herding-giraffe.md` (week-by-week with status markers + decisions/deviations). The reference test catalog is `TEST_CASES.md` (one entry per behavior we need to verify before shipping).

## Stack at a glance

- **Monorepo**: Turborepo + pnpm workspaces. Node 22+, pnpm 10+ (activate via `corepack enable`).
- **Web**: TanStack Start (React 19, Vite 7) + MUI v9 + TanStack Query v5. SSR-first.
- **API**: NestJS 11 (Express + CommonJS, plain `tsc`) + Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`) + Postgres 16 (Docker locally).
- **Auth**: Auth.js v5 mounted as Express middleware at `/api/auth/*` (magic link via Resend + Google + Microsoft Entra). JWT sessions.
- **Billing**: Stripe (API version `2026-05-27.dahlia` pinned) with graduated tiered pricing.
- **AI**: OpenAI Responses API (`openai` SDK v6) — direct OpenAI or Azure OpenAI EU via env-var switch. Structured outputs via `zodTextFormat`. `store: false` on every call for GDPR data-minimization. Provider-swap seam (`AI_CLIENT` token in `AiModule`) ready for the W5.1 Mistral/Anthropic spike.
- **Background jobs**: Inngest v4 mounted at `/api/inngest` (delta-sync workers, push handlers, scheduled crons).
- **Deploy target**: DigitalOcean App Platform EU (not wired yet; W1.5 carryover).

## Commands

Run from repo root unless specified. All scripts are turbo-orchestrated:

```bash
pnpm install                       # bootstrap workspaces
pnpm dev                           # api + web in watch mode
pnpm typecheck                     # tsc --noEmit across both apps
pnpm lint                          # eslint
pnpm format                        # prettier --write
pnpm test                          # runs jest (api) + vitest (web)
```

API-specific (in `apps/api/`):

```bash
pnpm db:up                         # docker compose: local Postgres
pnpm db:down
pnpm db:migrate                    # prisma migrate dev
pnpm db:deploy                     # prisma migrate deploy (prod)
pnpm db:generate                   # regen Prisma client into src/generated/prisma/
pnpm db:studio
pnpm db:seed                       # prisma db seed (runs prisma/seed.ts via tsx)
pnpm dev                           # rebuilds @offertum/shared once + then runs `tsc --watch`
                                   # on shared + `nest start --watch` on api, both in parallel
pnpm invite --email a@b.com --org <uuid> [--role MEMBER|OWNER|EXTERNAL]
pnpm fixtures:export [--reason NOT_A_QUOTE|SPAM] [--since YYYY-MM-DD] [--org <uuid>] [--limit N]
                                   # W4.6.6 — export owner-dismissed opportunities as classifier-fixture
                                   # candidates (JSONL → .fixture-candidates/, gitignored). Review and
                                   # paste into apps/api/src/modules/ai/classifier/fixtures/.
pnpm inngest                       # local Inngest CLI dev server (requires inngest-cli build script
                                   # — allowlisted in root `package.json#pnpm.onlyBuiltDependencies`)
```

Shared package (in `apps/shared/`):

```bash
pnpm build                         # tsc emit → dist/index.js + .d.ts (consumed by api/web)
pnpm dev                           # tsc --watch — re-emits dist/ on every source edit
pnpm typecheck                     # tsc --noEmit
```

The shared package is a **compile target**, not a "source as artifact" package — `package.json#main` points at `./dist/index.js`. The api's `pnpm dev` script bootstraps `dist/` automatically; outside dev, run `pnpm --filter @offertum/shared build` before anything that requires it (e.g., `pnpm typecheck` from root).

Web-specific (in `apps/web/`):

```bash
pnpm dev                           # vite dev (port 3000, proxies /api → 3001)
pnpm build                         # vite build (.output/)
pnpm start                         # node .output/server/index.mjs
pnpm test                          # vitest run
```

Single test runs:

```bash
# API (Jest) — from apps/api/
pnpm exec jest src/modules/billing/billing.service.spec.ts
pnpm exec jest -t "syncFromStripe clears state"

# Web (Vitest) — from apps/web/
pnpm exec vitest run src/lib/utils/foo.test.ts
```

## High-level architecture

### Two apps, talking via `/api/*`

- **Browser → web (port 3000)**. Vite dev proxies `/api/*` → API at 3001 with `changeOrigin: false` so the `Host` header stays `localhost:3000`. This is load-bearing for Auth.js: the magic-link callback must land on the web origin so the session cookie scopes correctly. **Don't change `changeOrigin`.**
- **Web SSR → API**. Browser fetches use relative URLs through the proxy. **SSR-side fetches must use absolute URLs + forwarded cookies** — that's what `lib/api/server-fetch.ts` (used inside `createServerFn` handlers) handles. Don't `fetch('/api/...')` in SSR code; it throws "Failed to parse URL".
- **Stripe webhook**. `POST /api/billing/webhook`. Signature-verified, no auth. Local dev: `stripe listen --forward-to localhost:3001/api/billing/webhook`.

### API layout (`apps/api/src/`)

```
common/                # cross-cutting framework primitives
  guards/              # auth, organization, owner, entitlement
  decorators/          # @TenantWrite, @OwnerWrite (composite UseGuards)
  filters/             # AllExceptionsFilter (forwards code + billingPath)
  dto/
config/                # @nestjs/config Zod env schema
lib/
  errors.ts            # ALL thrown messages live here (single source of truth)
  mails/               # Resend templates (Inter + Playfair, dedent-rendered)
  email/               # bulk-mail filter + rfc2822-reply builder + raw-message helpers
  storage/             # W5.5 — AttachmentStorage interface + local FS driver +
                       # constraints (size/MIME limits); @Global module
generated/prisma/      # Prisma client (committed; generator output)
modules/
  auth/                # auth.config (Auth.js v5 ExpressAuth) + auth.module
  prisma/              # @Global PrismaService
  logger/              # LogService — extends ConsoleLogger, persists fatal/error/warn to Log table
  billing/             # Stripe — controller / service / module / DTOs / constants
  invitations/
  me/
  ai/                  # W4–W5 — classifier + extractor + reply-draft + AIClient seam
    clients/           # AIClient interface + OpenAIClient (covers OpenAI + AzureOpenAI)
    classifier/        # ClassifierService + Dutch prompt + 43-fixture corpus + accuracy harness
    extractor/         # ExtractorService + Dutch prompt + 23-fixture corpus + accuracy harness
    reply-draft/       # W5.3 — ReplyDraftGenerator + Dutch prompt (tone-playbook aware)
    logging/           # AICallLogger — persists every generate() call to AICall table
    __test-utils/      # JSONL writer used by both accuracy harnesses for the local HTML report
  opportunities/       # W4.4–W5.6 — RawMessage → Opportunity pipeline, thread reconstitution,
                       # workflow + dismiss + draft endpoints
  reply-drafts/        # W5.3–W5.6 — Draft generate/regenerate/send + thread-reply headers;
                       # 1:N drafts per opp with createdAt-DESC "current" semantics
  reply-draft-attachments/  # W5.5 — Upload/list/delete/download endpoints + service;
                            # provider-agnostic via lib/storage's ATTACHMENT_STORAGE token
  gmail/               # Gmail OAuth + backfill + delta-sync + watch + webhook + sendMessage
  microsoft/           # Microsoft Graph OAuth + backfill + delta-sync + subscription + webhook + sendMail
  inngest/             # Inngest function registrations + client + processOpportunitiesInBatches helper
  email-accounts/      # provider-agnostic EmailAccountsService + OAuth services + soft-disconnect
  ai-usage/            # S16 — admin AI-call cost dashboard (token + USD per provider/model)
  classifier-quality/  # W4.6.5 — admin classifier-precision dashboard (dismiss-feedback aggregation)
```

Path aliases: `@/*` → `apps/api/src/*`. No `.js` suffixes in imports (NestJS = CommonJS in this project; SWC was tried and reverted in favor of plain `tsc`).

### Web layout (`apps/web/src/`)

```
routes/
  (auth)/route.tsx     # public layout (sign-in)
  (app)/route.tsx      # authenticated layout — redirects to /sign-in if no session
  (app)/billing/route.tsx   # beforeLoad: redirects non-owners to /
lib/
  api/                 # createServerFn handlers + browser fetch client
    server-fetch.ts    # absolute URL + cookie forwarding for SSR
    client.ts          # browser fetch wrapper (relative URLs, 402 auto-redirect)
  queries/             # *.queries.ts — queryOptions + mutation hooks per domain
  schemas/             # zod schemas for route search params / forms
  utils/               # theme, page meta, etc.
```

Path alias: `@/*` → `apps/web/src/*`.

## Architectural patterns that are non-obvious

### Three orthogonal request gates, three guards

For tenant-scoped routes, ask three independent questions:

| Question                            | Guard                                         |
| ----------------------------------- | --------------------------------------------- |
| Who are you?                        | `AuthGuard` (built into the others)           |
| Which org?                          | `OrganizationGuard` (built into `OwnerGuard`) |
| Is the org allowed to make changes? | `EntitlementGuard`                            |
| (Optional) Are you the org's OWNER? | `OwnerGuard`                                  |

Apply via composite decorators:

- `@UseGuards(OrganizationGuard)` — read; any member of the org.
- `@TenantWrite()` — write; any member; needs entitlement (covers trial/active/past_due/local-grace).
- `@UseGuards(OwnerGuard)` — owner-only, no entitlement check (e.g. billing Checkout — needed when the sub is _canceled_ to re-subscribe).
- `@OwnerWrite()` — owner-only write that also requires entitlement.

`EntitlementGuard` (formerly `TrialGateGuard` — renamed because it gates ALL non-entitled states, not just trials) returns `402 { code: 'billing_required', billingPath: '/billing' }`. The web `api()` client auto-redirects to `/billing` on that exact shape.

### Stripe sync — single source-of-truth function

`BillingService.syncFromStripe(customerId)` is the **only** path that writes to the local `Subscription` table. Every tracked webhook event triggers a full re-sync (never partial updates from event payloads). Pattern is Theo's "How I Stay Sane Implementing Stripe":

- Pinned API version `2026-05-27.dahlia`.
- `current_period_*` lives on `subscription.items.data[0]`, not the subscription root (Stripe moved it in 2024).
- `getOrCreateCustomer` is self-healing — verifies the local `stripeCustomerId` still exists at Stripe, recreates on `resource_missing`.
- Webhook handler 200s immediately and processes via `setImmediate` so Stripe's retry timer never fires for in-flight handlers.
- **Never pass `payment_method_types`** on Checkout/SetupIntents — use Dashboard Payment Method Configurations.

### Per-seat billing model

Stripe Price is graduated tiered: tier 1 = first `SEATS_INCLUDED` (3) seats at flat 50, tier 2 = 10/seat overage. `BillingService.syncSeatCount(orgId)` reconciles Stripe's billed `quantity` with `Membership.count` after every invitation accept, with `proration_behavior: 'create_prorations'`. Skipped during `local_trial` and after `canceled`. Trial orgs are capped at `SEATS_INCLUDED` seats (invitation creation rejects with `402 trial_seat_limit`).

### Logging routes through the DB

API uses `new Logger(ContextName)` everywhere, but `main.ts` calls `app.useLogger(app.get(LogService))` — so every `Logger` instance routes through `LogService`, which **persists fatal/error/warn to the `Log` Postgres table** (log/debug/verbose stay console-only). No third-party error tracking; the DB is the audit trail.

**Never use `console.*` in API code** that runs after `app.useLogger(...)`. `lib/mails/send.ts`, `auth.config.ts` use module-level `new Logger('Mail')` / `new Logger('Auth')`. Only `load-env.ts` (pre-Nest bootstrap) is allowed `console.log`.

### Error messages live in one file

`apps/api/src/lib/errors.ts` is the canonical home for every thrown message. Constants for static text (`INVITATION_NOT_FOUND`), functions for templates (`trialSeatLimitReached(cap)`). Service/controller/guard throw sites import from there — never inline strings.

### Web data fetching — loader + queryOptions + Suspense

For every GET in the web app:

1. Define a `createServerFn` handler in `lib/api/<feature>.api.ts` that calls `serverFetch(...)` (handles SSR absolute URL + cookie forwarding).
2. Wrap in `queryOptions({ queryKey, queryFn: <serverFn>, staleTime })` in `lib/queries/<feature>.queries.ts`.
3. In the route file: `loader: ({ context }) => context.queryClient.ensureQueryData(theQueryOptions)`.
4. In the component: `const { data } = useSuspenseQuery(theQueryOptions)`.

**Never** use bare `useQuery` for GETs at the component level (causes a render-then-fetch waterfall, breaks SSR-correct first paint). The route `loader` is the prefetch mechanism — `useSuspenseQuery` then reads guaranteed data.

POST/PATCH/DELETE use `useMutation` with the relative-URL `api()` client. Mutations that invalidate a query call `invalidateQueries({ queryKey: theQueryOptions.queryKey })`.

### Controllers return typed DTO classes

Every controller method has an explicit return-type annotation pointing at a DTO **class** (not interface) and is decorated with `@ApiOkResponse({ type: TheDto })` (use `[TheDto]` for arrays). This is required for Orval-generated client types — TS interfaces are erased at runtime and don't appear in the OpenAPI spec. Service methods that produce values that cross the controller boundary should be typed with the DTO directly — don't define a parallel interface with the same shape.

Service inputs (`CreateInvitationInput`) and module-private types (`PaymentMethodLike`, `ErrorResponseBody`) can remain interfaces — they never cross a boundary.

### SSR-safe formatting + helper conventions

In SSR-rendered components: **never** `toLocaleDateString(undefined, …)` or `Intl.*Format()` with undefined locale. Node defaults to `en-US`, the browser uses the visitor's locale → hydration mismatch.

All user-facing formatting goes through helpers in `apps/web/src/lib/utils/`:

- **Dates** — `apps/web/src/lib/utils/date.utils.ts`:
    - `toReadableDate(date)` — date-only, e.g. `17 mei`. For deadlines + inspection dates.
    - `toReadableDateTime(date)` — date + time, e.g. `17 mei 2026 14:32`. For activity logs + audit timestamps.
    - `toReadableTimestamp(date)` — human-relative, e.g. `2u geleden`. For inbox arrival times.
- **Numbers + currency** — `apps/web/src/lib/utils/number.utils.ts`:
    - `toReadableNumber(value)` — `1.234.567` (NL thousand separators). For counts + token totals.
    - `toReadableDecimal(value)` — `1.234,56` (NL decimal). For non-currency decimals.
    - `toReadableEuro(value)` / `toReadableUsd(value)` — fixed 2-decimal currency.
    - `toReadableUsdPrecise(value)` — 4-6 decimals for tiny per-call AI costs that round to zero at 2 decimals.

**Never** inline `toLocaleString(...)`, `toFixed(...)`, `Intl.NumberFormat(...)`, or `dayjs(...).format(...)` in components. Helpers keep the locale pinned to `nl-NL` so SSR + client render the same string, and centralize the format choices.

### Hook conventions

Free-standing custom hooks live in `apps/web/src/lib/hooks/` — one file per hook (e.g. `use-debounced-value.ts`). Hooks that are tightly coupled to a domain's `queryOptions` (mutation hooks, etc.) stay in their `lib/queries/<domain>.queries.ts` file so they sit next to the read they invalidate.

### Self-signup is BLOCKED

Auth.js's `createUser` is overridden to throw — only **invitations** create User rows. The `InvitationsService.accept` flow upserts the user via case-insensitive lookup (since legacy rows may exist mixed-case) and stores all new emails lowercased.

### Multi-org per user

A user has `currentOrganizationId` for the active session. `OrganizationGuard` reads that and attaches `request.organizationId`. Future "switch org" UI will let users pivot between memberships.

### Swagger docs are basic-auth-gated

`GET /docs` (Swagger UI) and `GET /docs/openapi.json` (raw spec) are protected by a small inline basic-auth middleware (`apps/api/src/common/middleware/docs-basic-auth.middleware.ts`). The middleware is wired ahead of `SwaggerModule.setup` in `main.ts` and reads `DOCS_USERNAME` + `DOCS_PASSWORD` from env. **Optional in dev** — when either is unset, the middleware is skipped and a `Bootstrap` warn log fires. **Required in production** — the env schema's `superRefine` rejects boot when `NODE_ENV=production` and either credential is missing, so the full API surface is never accidentally shipped unauthenticated. Comparison uses `timingSafeEqual` on equal-length buffers so wrong passwords take the same time as right ones.

## Conventions to follow

- TypeScript everywhere. Named exports for components/utilities; avoid default exports.
- Type/interface field order: primitives first, then booleans, then functions. Optionals after required.
- Boolean variable prefixes: `is*`, `has*`, `can*`, `should*`.
- All API modules under `src/modules/<feature>/`. New modules: controller + service + module + `dto/` (request DTOs and `*.response.dto.ts`).
- Per-app `.env` files (never root-level env). Read via `ConfigService<EnvSchema, true>.get('KEY', { infer: true })` for NestJS-managed code; raw `process.env` only for pre-DI code (`auth.config.ts`, `load-env.ts`, `lib/mails/send.ts`, `prisma/seed.ts`).
- UI text in English first (Dutch i18n later).

## Stripe testing

`stripe listen --forward-to localhost:3001/api/billing/webhook` must be running in another terminal. The `whsec_…` it prints goes into `apps/api/.env` as `STRIPE_WEBHOOK_SECRET`. Restart the API after changing.

Quick scenarios:

- `stripe trigger payment_intent.succeeded` — proves the channel works.
- `stripe subscriptions update sub_XXX --trial-end=now` — end an active trial (only works if status is `trialing`; if already `active`, cancel and re-subscribe via `/billing`).
- `stripe subscriptions cancel sub_XXX` — kill an active sub to test resubscribe.

See `TEST_CASES.md` for the full Stripe / billing test catalog (BILLING-01..25, INV-01..17, etc.).

## Inngest dev workflow (W3.3+)

The API exposes `/api/inngest` (mounted in `main.ts`, same pattern as Auth.js). Functions live in `apps/api/src/modules/inngest/functions/` and register via the array in `functions/index.ts`.

Local dev needs the Inngest CLI running alongside the API:

```bash
# Terminal 1
pnpm dev                                                 # API + web

# Terminal 2
pnpm --filter @offertum/api inngest                       # discovers /api/inngest (pinned inngest-cli devDep)
# Open http://localhost:8288 — every registered function shows up here.
```

The CLI dev server handles auth at the localhost boundary, so `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` stay empty in dev. They're required in production (Inngest Cloud → Settings → Keys).

Smoke checks:

- **Manual event** → in the dev UI: New event → `{"name": "test/hello", "data": {"name": "Offertum"}}` → run history shows the `hello` fn output `{ "greeting": "Hello, Offertum!" }`.
- **Scheduled cron** → `heartbeat` fires at `0 * * * *`. In the dev UI use "Invoke" to bypass the cron and trigger it manually.

Adding a new function:

1. Create `apps/api/src/modules/inngest/functions/<name>.function.ts` exporting an `InngestFunction.Any`-typed constant.
2. Add the import + export to `functions/index.ts`.
3. Reload the API — the dev UI picks it up on the next discovery poll.

## Gmail push notifications dev workflow (W3.5)

Pub/Sub push delivery requires a publicly-reachable HTTPS URL. Same shape as the Stripe webhook flow but heavier: instead of a single CLI you need an ngrok tunnel + a real GCP project. **Skip this section entirely for local-only dev** — `GmailWatchService` no-ops cleanly when `GOOGLE_PUBSUB_TOPIC` is unset, so the connect / backfill / disconnect flow works without any of this.

Two ways to exercise the push pipeline locally:

### Easy: simulate the push (no GCP, validates delta-sync only)

Bypasses the webhook + JWT verification. Connect Gmail through the UI, copy the `EmailAccount.id` from `db:studio`, then in the Inngest dev UI (http://localhost:8288) fire:

```json
{ "name": "gmail/history.changed", "data": { "emailAccountId": "<paste>" } }
```

Sends a real `users.history.list` to Google with the stored cursor, persists new `RawMessage` rows, advances `historyId`. Good enough to verify the delta-sync code; doesn't exercise Pub/Sub or JWT verification.

### Full: end-to-end via ngrok + GCP Pub/Sub

One-time setup per dev machine:

1. **Pub/Sub topic** in GCP — `projects/<gcp-project>/topics/offertum-gmail-dev`. On the topic's Permissions tab, grant `gmail-api-push@system.gserviceaccount.com` the **Pub/Sub Publisher** role (without this, `users.watch` 403s — the #1 Phase C gotcha).
2. **Reserved ngrok domain** — free tier gives one. Run `ngrok http 3000 --domain=<your-domain>` pointing at the **web** port (3000), so `/api/*` proxies through to the API.
3. **Push subscription** on the topic — Delivery type: **Push**; Endpoint URL: `https://<your-domain>/api/email/gmail/webhook`; Enable authentication: **ON**; Audience: same as the endpoint URL; pick or create a service account with `roles/iam.serviceAccountTokenCreator`.
4. **Authorized redirect URIs** on the Google OAuth client — add `https://<your-domain>/api/email/gmail/callback` and `https://<your-domain>/api/auth/callback/google` so OAuth callbacks land on the tunnel domain during smoke testing.
5. **`apps/api/.env`**:
    ```bash
    GOOGLE_PUBSUB_TOPIC=projects/<gcp-project>/topics/offertum-gmail-dev
    GOOGLE_PUBSUB_AUDIENCE=https://<your-domain>/api/email/gmail/webhook
    GOOGLE_PUBSUB_SERVICE_ACCOUNT=<service-account-email-from-step-3>
    ```
    Restart `pnpm dev`.

Smoke flow (4 terminals: `pnpm dev`, `pnpm --filter @offertum/api inngest`, `ngrok ...`, `db:studio`):

1. Sign in via the **ngrok URL** (not `localhost:3000` — OAuth callbacks need to land on the tunnel domain).
2. Connect Gmail at `/settings/email`. The `gmail-backfill` Inngest run shows `gmail-backfill`, `gmail-backfill-process-opportunities`, then `gmail-start-watch`. After completion: `EmailAccount.historyId` set AND `watchExpiresAt` ~7 days out.
3. Send yourself a test email from another account.
4. Within 5–10 seconds:
    - **ngrok inspector** (http://localhost:4040): POST to `/api/email/gmail/webhook` with a `Bearer eyJ...` JWT, response 204.
    - **Inngest UI**: `gmail-delta-sync` fires (2 s debounce — wait a beat), run reports `messagesInserted: 1`.
    - **`RawMessage`** in `db:studio`: the new row.

Renewal cron is verifiable without waiting a week: in `db:studio` backdate `watchExpiresAt` to yesterday → in the Inngest UI click **Invoke** on `gmail-watch-renewal` → output reports `{ scanned: 1, renewed: 1, ... }` and `watchExpiresAt` jumps back to ~7 days out. Same path also verifies the orphan-row fix: NULL out `watchExpiresAt` (keep `historyId`) and Invoke again — orphan still gets picked up.

Common Phase C gotchas (in order of frequency):

| Symptom                                                                                          | Fix                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users.watch` returns 403 / `Insufficient Permission`                                            | `gmail-api-push@system.gserviceaccount.com` missing Publisher on topic (Step 1).                                                                                                                                                                                                                                                                                                                           |
| OAuth callback redirects to `localhost:3000`                                                     | `WEB_ORIGIN` in `apps/api/.env` still set to `http://localhost:3000`. Auth.js's `redirect` callback rewrites every post-signin URL to this value. **Set `WEB_ORIGIN=https://<your-ngrok>` for the smoke**, restart API, then put it back when done.                                                                                                                                                        |
| Sign-in completes but home page bounces to `/sign-in` (and `Failed to load organizations (401)`) | `AUTH_URL=http://localhost:3000/api/auth` set in `apps/api/.env`. This env var **overrides** Auth.js's header-based URL detection — `@auth/express`'s `getSession` builds an HTTP URL → uses non-secure cookie name → can't find the `__Secure-`-prefixed cookie that ExpressAuth set. **Unset `AUTH_URL` for the smoke** (and for dev in general — `trustHost: true` handles URL detection from headers). |
| Webhook 401 on every push                                                                        | `GOOGLE_PUBSUB_AUDIENCE` doesn't match the subscription's audience exactly, OR `GOOGLE_PUBSUB_SERVICE_ACCOUNT` doesn't match the actual signer in the subscription's Auth section. The `gmail.webhook.jwt_invalid` action log includes the JWT's actual `email` claim — copy-paste that into env.                                                                                                          |
| Webhook 503                                                                                      | One of `GOOGLE_PUBSUB_AUDIENCE` / `GOOGLE_PUBSUB_SERVICE_ACCOUNT` is empty — by design (refuse to accept pushes when verification isn't configured).                                                                                                                                                                                                                                                       |
| Vite responds 403 "host not allowed"                                                             | ngrok subdomain not in `apps/web/vite.config.ts` `server.allowedHosts`. The `.ngrok-free.dev` wildcard already in main covers the free tier; add `.ngrok.app` etc. if you use a different TLD.                                                                                                                                                                                                             |
| Push arrives but `gmail.webhook.unknown_mailbox` 204                                             | `EmailAccount.email` doesn't match Gmail's primary alias. Check `db:studio`.                                                                                                                                                                                                                                                                                                                               |
| OAuth callback hits `localhost:3000` instead of the tunnel                                       | You signed in via localhost; restart from the ngrok URL.                                                                                                                                                                                                                                                                                                                                                   |
| Push body has empty `message.data`                                                               | Gmail occasionally fires heartbeat-style pushes with no data. Webhook returns 400 → Pub/Sub retries → eventually drops. Not blocking but noisy.                                                                                                                                                                                                                                                            |

**Env hygiene after smoke:** revert `WEB_ORIGIN` to `http://localhost:3000` if you want normal-localhost dev to keep working. `GOOGLE_PUBSUB_TOPIC` / `AUDIENCE` / `SERVICE_ACCOUNT` are inert during localhost dev (the watch service only fires when you connect through the configured topic, which requires the ngrok flow) — fine to leave set.

**`AUTH_URL` recommendation:** leave unset in dev. `trustHost: true` in `authConfig` makes Auth.js use the request Host header for URL detection, which works for both localhost AND ngrok without env churn. Only set `AUTH_URL` in production deploys where you want to pin the canonical URL against Host-header spoofing.

See `TEST_CASES.md` → EMAIL-PUSH-01..06 for the full test catalog.

## Microsoft Graph push notifications dev workflow

Same shape as the Gmail Pub/Sub flow above but simpler — Graph's subscription model is one POST to `/subscriptions` with a `notificationUrl`, no separate topic/subscription split. Graph does a synchronous validation handshake (POST `<notificationUrl>?validationToken=<random>`, expects the token echoed back as `text/plain` within ~5 s) so the URL must be publicly reachable + HTTPS. **Skip this section entirely for local-only dev** — `MicrosoftSubscriptionService` no-ops cleanly when `MICROSOFT_GRAPH_NOTIFICATION_URL` is unset, so the connect / backfill / disconnect flow works without any of this.

Two ways to exercise the push pipeline locally:

### Easy: simulate the delta-sync (no ngrok, validates the pipeline only)

Bypasses the webhook + JWT-style validation. Connect Microsoft through the UI, copy the `EmailAccount.id` from `db:studio`, then in the Inngest dev UI (http://localhost:8288) fire:

```json
{ "name": "microsoft/delta.changed", "data": { "emailAccountId": "<paste>" } }
```

Triggers `microsoft-delta-sync` against the stored `deltaLink`, persists new `RawMessage` rows, advances the cursor. Good enough to verify the delta-sync code; doesn't exercise the validation handshake or subscription registration.

### Full: end-to-end via ngrok + Graph subscriptions

One-time setup per dev machine:

1. **Reserved ngrok domain** — free tier gives one. Run `ngrok http 3000 --domain=<your-domain>` pointing at the **web** port (3000), so `/api/*` proxies through to the API.
2. **Authorized redirect URIs** on the Microsoft app registration — add `https://<your-domain>/api/email/microsoft/callback` so the OAuth callback lands on the tunnel domain during smoke testing.
3. **`apps/api/.env`**:
    ```bash
    MICROSOFT_GRAPH_NOTIFICATION_URL=https://<your-domain>/api/email/microsoft/webhook
    ```
    Restart `pnpm dev`.

Smoke flow (4 terminals: `pnpm dev`, `pnpm --filter @offertum/api inngest`, `ngrok ...`, `db:studio`):

1. Sign in via the **ngrok URL** (not `localhost:3000` — OAuth callbacks need to land on the tunnel domain).
2. Connect Microsoft at `/settings/email`. The `microsoft-backfill` Inngest run shows `microsoft-backfill`, `microsoft-backfill-process-opportunities`, then `microsoft-start-subscription`. After completion: `EmailAccount.subscriptionId` set AND `watchExpiresAt` ~3 days out.
3. Send yourself a test email from another account.
4. Within 5–10 seconds:
    - **ngrok inspector** (http://localhost:4040): POST to `/api/email/microsoft/webhook` with a `clientState`-bearing body, response 202.
    - **Inngest UI**: `microsoft-delta-sync` fires, run reports `messagesInserted: 1`.
    - **`RawMessage`** in `db:studio`: the new row.

Renewal cron is verifiable without waiting 3 days: in `db:studio` backdate `watchExpiresAt` to yesterday → in the Inngest UI click **Invoke** on `microsoft-subscription-renewal` → output reports `{ scanned: 1, renewed: 1, ... }` and `watchExpiresAt` jumps back to ~3 days out.

Common gotchas (in order of frequency):

| Symptom                                                                             | Fix                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Microsoft Graph subscriptions.create failed: HTTP 400` after a successful backfill | ngrok tunnel is down, or `MICROSOFT_GRAPH_NOTIFICATION_URL` is `http://` (Graph requires HTTPS), or the URL isn't publicly reachable. Restart ngrok with `--domain=<reserved>` and confirm `curl https://<domain>` from a different network. |
| Subscription registers but validation handshake fails                               | The webhook controller must short-circuit on the `validationToken` query param BEFORE doing JSON parsing or rate-limit checks. See `microsoft-webhook.controller.ts` — the early-return at the top of the handler is load-bearing.           |
| OAuth callback redirects to `localhost:3000`                                        | Same as the Gmail flow above — `WEB_ORIGIN` in `apps/api/.env` is still set to `http://localhost:3000`. Override to the ngrok URL for the smoke, restore after.                                                                              |
| Webhook 401                                                                         | `clientState` mismatch — the stored `subscriptionClientState` on EmailAccount doesn't match what's being echoed back. Disconnect + reconnect to regenerate.                                                                                  |
| `Microsoft Graph API ... failed: <specific message>` in console                     | Item 1 of the W9.x cleanup wired Graph's `error.message` into the thrown exception. Trust it — the cause is verbatim from Graph.                                                                                                             |

**Env hygiene after smoke:** unset `MICROSOFT_GRAPH_NOTIFICATION_URL` if you want to test reconnect flows without push (Graph rejects the subscription if it can't validate the URL, and the post-backfill subscription start will log an error every time). Backfill itself is unaffected — push delivery is a separate concern from sync.

## AI pipeline + draft + send (W4.1 → W5.6)

OpenAI Responses API behind a provider-agnostic `AIClient` seam. Every call is wrapped so provider lock-in is a one-line DI binding change in `AiModule`, not a service rewrite (W5.1 locked OpenAI for MVP per `PROVIDER_NOTES.md` — no Mistral/Anthropic spike). The pipeline materializes `RawMessage` rows into `Opportunity` rows (W4.4), surfaces them through a URL-persisted list page (W4.5), closes the classifier feedback loop via owner dismissals (W4.6 / W4.6.5), generates AI replies (W5.3) editable in a detail view (W5.4), sends them threaded via Gmail/Graph with optional attachments (W5.5), and handles inbound customer replies + manual follow-up composition (W5.6).

### Layout

```
apps/api/src/modules/ai/
├── ai.module.ts                            # DI wiring; binds AI_CLIENT → OpenAIClient via useExisting
├── clients/
│   ├── ai-client.interface.ts              # AIClient interface + AI_CLIENT symbol token + typed errors
│   └── openai-client.service.ts            # Wraps `openai` SDK. Switches OpenAI direct vs AzureOpenAI on env.
├── classifier/
│   ├── classifier.types.ts                 # Zod schema: { isQuote, confidence, reason }
│   ├── classifier.service.ts               # classify(input): wraps AIClient with the classifier prompt
│   ├── prompts/nl.ts                       # Dutch-language prompt (D21 — sibling files for en/de/fr later)
│   ├── fixtures/nl-quote-requests.fixtures.ts   # 43 hand-curated Dutch fixtures
│   └── classifier.accuracy.spec.ts         # LIVE-API harness. Skipped without OPENAI_API_KEY.
├── extractor/
│   ├── extractor.types.ts                  # Zod schema: 8 fields (customerName, ..., customerAppointment)
│   ├── extractor.service.ts                # extract(input, referenceDateIso): same shape as classifier
│   ├── prompts/nl.ts                       # Dutch prompt — includes date resolution rules
│   ├── fixtures/nl-extraction-expected.fixtures.ts   # 23 expected-extraction entries
│   └── extractor.accuracy.spec.ts          # LIVE-API harness. Same gating as classifier.
├── logging/
│   └── ai-call-logger.service.ts           # Persists every generate() call to the AICall table
└── __test-utils/
    └── ai-report-writer.ts                 # Both accuracy specs append JSONL → consumed by build-ai-report
```

W4.4–W5.6 add the user-facing materialization + feedback + draft + send layers under `apps/api/src/modules/opportunities/`:

```
opportunities/
├── opportunities.controller.ts              # GET list (owner + assignee filters) + GET :id detail +
│                                            # PATCH status + PATCH :id/assignee + PATCH/DELETE :id/dismiss +
│                                            # PATCH :id/reply-draft (autosave) + POST
│                                            # :id/reply-draft/{regenerate,send,followup} + attachment
│                                            # endpoints (POST upload, GET list, GET :aid/download, DELETE)
├── opportunities.service.ts                 # Mode-aware processBatch (backfill | live) + processThreadGroup +
│                                            # composeFollowupReplyDraft + dismiss/undismiss + assignOpportunity +
│                                            # logAutoAssignment helper + toOpportunityTimelineEvent mapper
├── opportunities.repository.ts              # Prisma persistence, rawMessageId idempotency, AICall FKs,
│                                            # findOpportunityForThread + attachFollowupMessage +
│                                            # attachThreadMessage + findOrganizationEmailAddresses +
│                                            # findTimelineEvents (Log JSON-path filter, cap 200) +
│                                            # findLatestEditorPerOpportunity (DISTINCT ON, list badge) +
│                                            # findUserDisplayLabels (batched name+email lookup) +
│                                            # findColdCandidates (unsent-draft guard) +
│                                            # markOpportunitiesCold (UPDATE ... RETURNING) +
│                                            # assignOpportunity + isUserMemberOfOrganization
├── reply-draft-editability.ts               # Single helper: latest draft SENT = locked
├── opportunity-status.mapper.ts             # Prisma enum ↔ lowercase wire status (transitions fully open)
├── opportunity-urgency.mapper.ts            # Prisma Urgency enum ↔ lowercase wire urgency
├── opportunity-dismiss-reason.mapper.ts     # Prisma DismissReason ↔ lowercase wire reason
├── reply-draft-status.mapper.ts             # Prisma ReplyDraftStatus ↔ lowercase wire status
├── opportunity-list-cursor.ts               # Opaque base64url cursor over (createdAt, id)
└── dto/                                     # Concrete DTO classes for OpenAPI/Orval
                                             # (AssignOpportunityDto, DismissOpportunityDto,
                                             # OpportunityDetailResponseDto, ReplyDraftResponseDto,
                                             # UpdateReplyDraftDto, ...)
```

W5.3–W6.1 add the AI-reply-generation + send mechanics under `apps/api/src/modules/reply-drafts/`:

```
reply-drafts/
├── reply-drafts.service.ts                  # upsertFromOpportunity (W5.3 initial draft) +
│                                            # regenerate (W5.4 in-my-style) + send (W5.5 Gmail/Graph) +
│                                            # generateFollowupDraft (W5.6 customer-reply OR owner-compose) +
│                                            # generateCheckInDraft (W6.1 silence check-in, re-validates eligibility)
├── reply-drafts.repository.ts               # findByOpportunityId (latest by createdAt DESC) +
│                                            # createIfAbsent (first draft) + createFollowup (always new, accepts kind) +
│                                            # overwriteAfterRegenerate + markSent (conditional opp.status) +
│                                            # findSendContext (+ thread-reply headers) +
│                                            # findCheckInCandidates + reValidateCheckInCandidate (W6.1, raw SQL)
└── reply-drafts.module.ts                   # Imports AiModule, EmailAccountsModule, GmailModule,
                                             # MicrosoftModule; @Inject(ATTACHMENT_STORAGE) on the service
```

W5.5 attachment endpoints + storage abstraction under `apps/api/src/modules/reply-draft-attachments/` + `apps/api/src/lib/storage/`:

```
reply-draft-attachments/
├── reply-draft-attachments.service.ts       # Upload (validates count/size/MIME + writes to storage),
│                                            # list, delete (DB row first, then blob), download
└── reply-draft-attachments.repository.ts    # Prisma CRUD + findDraftForUpload (latest editable) +
                                             # findForAuthorization (cross-tenant guard in one query)

apps/api/src/lib/storage/
├── attachment-storage.interface.ts          # AttachmentStorage interface + ATTACHMENT_STORAGE DI token
├── attachment-storage.module.ts             # @Global module; useFactory picks driver from env
├── attachment-constraints.ts                # 20 MB/file, 25 MB total, 10 files/draft, MIME allowlist
└── local-attachment-storage.service.ts      # FS impl: writes under .attachments/<draftId>/<uuid>-<file>
                                             # + .contenttype sidecar; path-safety check
```

W4.6.5 adds the admin classifier-quality dashboard under `apps/api/src/modules/classifier-quality/` — same `AdminEmailGuard` parent route as `/admin/ai-usage`. It computes precision (`1 − any-dismissal / total`) per `(org, classifierProvider, classifierModel)` with a per-reason breakdown, top-5 recent dismissals (any reason) with `classifiedAiCallId` for AI-Calls-inspector deep-link, and bulk-mail filter recall (filter-caught Log count vs. SPAM-dismissed count). Reads only from `Opportunity` + `Log` + the `AICall` FK chain — no new persistence.

The Inngest backfill + delta-sync functions chain the pipeline via `processOpportunitiesInBatches` (in `apps/api/src/modules/inngest/functions/`), which calls `OpportunitiesService.processBatch` inside its own dynamic `step.run` per batch. Each batch is capped at `PROCESS_BATCH_SIZE = 25` so a single step finishes well within Inngest's 5-minute step timeout; the outer loop is bounded by `PROCESS_MAX_BATCHES_PER_RUN = 200` (≈5,000 messages/pass) with a `opportunity.pipeline.batch_cap_reached` warn log if hit.

### Patterns to know

**1. The `AI_CLIENT` seam.** Downstream services (`ClassifierService`, `ExtractorService`, future `ReplyDraftService`, etc.) inject `@Inject(AI_CLIENT) private readonly ai: AIClient` — they don't know whether OpenAI, Mistral, or Anthropic is behind it. Swapping providers in W5.1 is a one-line change to `useExisting: OpenAIClient` in `ai.module.ts`. Caller code never sees it.

**2. `AICall` is the single source of truth for AI activity.** Every `generate()` call writes one row: provider, model, purpose, prompt, response, parsed JSON, status (`SUCCESS | FAILED | SCHEMA_INVALID | TIMEOUT`), tokens, latency, requestId/userId/orgId from AsyncLocalStorage. Used for:

- **Replay** when prompts iterate: rerun new prompt over historical AICall rows
- **Cost tracking** per org per month (`promptTokens` + `completionTokens` sums)
- **Debugging** schema failures (filter `status = SCHEMA_INVALID`)
- **Year-2 self-improvement** — the whole reason `RawMessage` is unfiltered: re-classify negatives when the classifier improves

`AICallLogger.record(...)` is best-effort: if persistence fails, the AI call's return value is still given to the caller (we don't drop a legitimate response over a Postgres hiccup).

**3. `store: false` on every OpenAI call.** OpenAI's default is to retain prompt + response for 30 days for abuse monitoring. We opt out — Dutch SMB customer data shouldn't sit on US servers we don't control. Trade-off: can't use Responses-API chaining (`previous_response_id`), but we don't need it for one-shot classification + extraction. Documented in `openai-client.service.ts`.

**4. `RawMessage` is the pipeline idempotency root.** W4.4 does not emit one event per inserted message because Gmail/Graph backfill + delta sync intentionally use `createMany` and return counts, not inserted IDs. Inngest runs account-level processing after each backfill/delta step: scan unclassified `RawMessage` rows, classify, extract positives, and create `Opportunity` rows. `Opportunity.rawMessageId` is unique, and repository writes use `createMany(..., skipDuplicates: true)` so retries and overlapping syncs cannot duplicate opportunities.

**5. Positive extraction failures stay retryable.** A negative classifier result sets `RawMessage.isQuoteRequest = false` and `classifiedAt`. A positive classifier result only marks the raw message classified after the extractor succeeds and the opportunity write has been attempted. If extraction fails, the row stays unclassified so the next processing run can retry instead of losing the lead.

**6. `AIClient.generate()` returns `{ value, provider, model, callId }`.** Not just the parsed value. `callId` is the `AICall` row's UUID (or `null` if the audit-log persist failed). `OpportunitiesService` captures the classifier + extractor call IDs and writes them to `Opportunity.classifiedAiCallId` / `Opportunity.extractedAiCallId` so a row in the product UI is one join away from the exact prompt/response that produced it. `aiProvider` on `Opportunity` is the composite `${provider}/${model}` from the extractor call (e.g. `openai/gpt-4o`) — keeps W5.1's accuracy-vs-cost slice precise by exact SKU, not just vendor.

**7. Bulk-mail pre-filter short-circuits before the AI runs.** `apps/api/src/lib/email/bulk-mail-filter.ts` runs three conservative checks against every `RawMessage` before `processOneRawMessage` calls the classifier: `List-Unsubscribe` header (Gmail `payload.headers` + Microsoft `internetMessageHeaders`), known unsubscribe phrases in the body (Dutch + English), and 2+ tracking-domain links (bit.ly, mailchi.mp, sendgrid.net, etc.). Any one match → mark `RawMessage` negative, log `opportunity.pipeline.bulk_mail_skipped`, return early. Saves OpenAI cost AND prevents the vendor-direction failure mode where affiliate marketing copy ("vraag offerte aan" CTAs) bait the classifier into a false positive. Conservative tuning is load-bearing: a false positive here drops a real customer's quote request, much worse than a few marketing emails reaching the classifier. The classifier prompt itself is a second line of defense (see the new "Affiliate/lead-gen marketing" rule in `apps/api/src/modules/ai/classifier/prompts/nl.ts`).

**8. AsyncLocalStorage context must be re-established inside each Inngest `step.run` callback.** The standard pattern of wrapping the whole function body in `logContext.run(...)` doesn't propagate across `step.run` boundaries — Inngest schedules step callbacks on a different async chain than the function body. `apps/api/src/modules/inngest/functions/define-mailbox-pipeline-function.ts` solves this by computing a `correlation = { requestId, organizationId }` object once at the top of the handler and re-entering `requestContext.run(correlation, …)` INSIDE every `step.run` callback (the sync step, each opportunities-batch step, the post-sync step). Without that, every `AICall` + `Log` row from background work lands with `requestId` = the request-context middleware's v4 UUID and `organizationId = NULL`.

**9. OAuth callback failures redirect with a stable error code, never 500.** Both `gmail.controller.ts` and `microsoft.controller.ts` wrap the consent-onwards path in `try/catch` and throw `EmailConnectError(EmailConnectErrorCode.*)` from helper points (state mismatch, code reused, token exchange failed, userinfo failed). The controller catches them and redirects to `/settings/email?error=<code>`. The web layer maps the code → friendly copy in `apps/web/src/lib/utils/email-connect-error.ts`. Old URLs from before this landed still render (fallback to a generic message); adding a new code on the API without updating the mapping just produces the generic copy — never a blank screen.

**10. Dismiss is a soft-disable, not a status (D28).** `Opportunity.dismissedAt + dismissReason + dismissedById` are _orthogonal_ to `OpportunityStatus`. Adding `not_a_quote` as a status value would have polluted the workflow funnel (`lost` already means "real quote we didn't win"). The DB enforces consistency via a raw-SQL CHECK constraint: `(dismissedAt IS NULL) = (dismissReason IS NULL)`. A partial index `Opportunity_org_createdAt_active_idx ON (organizationId, createdAt DESC) WHERE dismissedAt IS NULL` keeps the default list query fast even with thousands of dismissed rows. The `statusCounts` payload excludes dismissed rows so tab counts stay honest. **All four reasons (`NOT_A_QUOTE | DUPLICATE | SPAM | OTHER`) count toward precision** in `/admin/classifier-quality` — from the owner's perspective every dismiss is a system error; the reason diagnoses _which_ subsystem failed (classifier vs. bulk-mail filter vs. dedup), not whether it counts.

**11. The classifier precision query is OR'd over `createdAt` AND `dismissedAt`.** `apps/api/src/modules/classifier-quality/classifier-quality.service.ts:fetchPrecisionRows` selects opportunities whose `createdAt` falls in window OR whose `dismissedAt` falls in window. Without the OR, a dismiss action on a backfilled opportunity (created weeks ago) wouldn't register on short ranges — a credibility wound on a feedback-loop UI where the user expects their click to show up immediately. Prisma de-dups rows matching both legs. The recent-dismissals query and the bulk-mail `missedCount` query stay filtered by `dismissedAt` alone since they're activity-based, not cohort-based.

**12. URL-persisted filters via `validateSearch` Zod schemas.** Every TanStack Router route that exposes filterable lists puts every filter dimension into a route-level Zod schema: `apps/web/src/routes/(app)/opportunities/index.tsx` persists `status`, `search`, `sort`, and `showDismissed` to the URL via `validateSearch`. The `loader` uses `loaderDeps` to declare which search params should re-trigger prefetching. Search input uses the buffered-input pattern: local state for keystrokes, `useDebouncedValue` for the URL write, `navigate({ replace: true })` so history doesn't grow per keystroke. The two `useEffect`s (URL→input mirror, input→URL debounce) explicitly disable `react-hooks/set-state-in-effect` because they ARE the mirror pattern; this is the only legitimate use.

**13. Provider-asymmetric thread reply headers.** Gmail sends accept raw RFC 2822 (`In-Reply-To` + `References` headers go straight into the envelope via `buildRfc2822Reply` at `apps/api/src/lib/email/rfc2822-reply.ts`). Microsoft Graph **rejects** those same headers in `internetMessageHeaders` — that array only accepts user-defined `x-*` headers. For Graph we set MAPI extended properties instead:`String 0x1042` (`PR_IN_REPLY_TO_ID`) + `String 0x1039` (`PR_INTERNET_REFERENCES`) via `singleValueExtendedProperties` on the message payload (`microsoft-graph-api.service.ts:sendMail`). Outlook writes the correct RFC headers on the wire from those tags, recipients see a normally-threaded reply. Service-layer caller is provider-blind — `ReplyDraftsService.send` just passes `inReplyTo` + `references` strings through.

**14. 1:N reply drafts per opportunity with `createdAt DESC` "current" semantics.** W5.6 dropped `@unique` on `ReplyDraft.opportunityId` so the same opp can carry an immutable SENT history plus one editable draft on top (composed via thread reconstitution when the customer replies, or via the "Concept-vervolg opstellen" button). Every read site that wants "the current draft" uses `findFirst({ where: { opportunityId }, orderBy: { createdAt: 'desc' } })`; OPPORTUNITY_INCLUDE / OPPORTUNITY_DETAIL_INCLUDE fetch all drafts ordered DESC so the mapper plucks `[0]` for current + `slice(1)` for the history panel. `Opportunity.replyDrafts: ReplyDraft[]` on Prisma type; wire-format DTO surfaces both `replyDraft: ReplyDraft | null` (current/latest) and `replyDraftHistory: ReplyDraft[]` (everything older, newest-first).

**15. Mode-aware opportunity pipeline (`'backfill' | 'live'`).** `OpportunitiesService.processBatch(emailAccountId, excluded, { mode })` is the entry point; mode is plumbed through `processOpportunitiesInBatches` → `MailboxPipelineFunctionConfig`. Backfill functions pass `'backfill'`; delta-sync functions pass `'live'`. Backfill **suppresses `OpportunityFollowupReceived` events** (a snapshot of historical thread messages shouldn't generate N phantom drafts) AND activates **thread-as-unit classification** for multi-message thread groups in the batch (classify **oldest-first**, anchor opp to the first non-self positive — that's the customer's actual _original_ request, with subject "Badkamer" rather than "Re: Badkamer" — then attach the rest as silent history; chitchat threads produce zero opps via `opportunity.pipeline.thread_no_positive`). Live mode keeps the per-message flow with thread-reconstitution → `OpportunityFollowupReceived` → fresh draft against the latest customer reply.

**16. Self-email filter.** Every batch first calls `repository.findOrganizationEmailAddresses(orgId) → Set<string>` (lower-cased). Inside `processOneRawMessage` + `processThreadGroup`, any inbound RawMessage whose `fromEmail` matches the set is short-circuited before classification (mark negative + log `opportunity.pipeline.self_email_skipped`). This catches the cross-mailbox echo case: user has both Gmail and Outlook connected, Offertum sends a reply via Outlook → it lands as inbound on Gmail → classifier would otherwise flag the Dutch quote-prep prose as positive and create a phantom opp.

**17. Pluggable attachment storage seam.** `apps/api/src/lib/storage/attachment-storage.interface.ts` defines `AttachmentStorage` (put/get/delete) bound by the `ATTACHMENT_STORAGE` symbol DI token in a `@Global` module. `LocalAttachmentStorage` is the default (writes under `.attachments/<draftId>/<uuid>-<filename>` with a `.contenttype` sidecar; path-safety check defends against future user-supplied keys). `useFactory` in `AttachmentStorageModule` picks the driver from `ATTACHMENT_STORAGE_DRIVER` env (`local` | `spaces`); selecting `spaces` today throws at boot — explicit "not wired yet" rather than a silent fall-through to local. Swapping to DigitalOcean Spaces is one new file + one factory branch.

**18. Draft editability collapses to draft-state-only (W5.6-followup).** `isReplyDraftEditable({ draftStatus })` in both apps (`apps/api/src/modules/opportunities/reply-draft-editability.ts` + `apps/web/src/lib/utils/reply-draft-editability.ts`) returns `draftStatus !== 'sent'`. The prior opp-status leg (`replied / won / lost` → locked) was a 1:1-era workaround that caused a real bug: composing a courtesy follow-up on a WON deal would silently flip workflow status to REPLIED. With 1:N drafts, the latest draft's own status is fully expressive. Send-time also conditionalises the opp.status transition: `markSent` only flips `NEW/WAITING/COLD → REPLIED`; `WON/LOST/REPLIED` stay put.

**19. RFC 2822 multipart for Gmail attachments, JSON array for Graph.** `buildRfc2822Reply` switches to `multipart/mixed` with a random 128-bit boundary when `attachments` is non-empty; each part has `Content-Type` + `Content-Disposition: attachment` + RFC 2231 `filename*=UTF-8''<encoded>` for non-ASCII names; base64 body wrapped at 76 cols per RFC 2045. Graph's `sendMail` takes a structured `attachments: [{ '@odata.type': '#microsoft.graph.fileAttachment', name, contentType, contentBytes: base64 }]` array. Service-layer `ReplyDraftsService.send` loads each blob from `AttachmentStorage.get(storageKey)` in parallel before opening the OAuth-scoped send block, runs a final defense-in-depth total-bytes guard (25 MB cap), then hands provider-specific shapes to Gmail/Graph.

**20. Fully-open opportunity status transitions.** `isOpportunityStatusTransitionAllowed` was deleted (it always returned true after W5.5-followup; the per-status policy table was aesthetic). Any status → any other. Misclicks on WON/LOST recoverable. The same-status no-op short-circuit stays in `updateStatus` to avoid a wasted DB write. Audit-log (`Log` table) remains the authoritative trail of every transition for forensics.

**21a. Voice + sign-off resolution (W6.1-followup).** Every reply-draft generation path resolves two things separately: the **writing-style playbook** (the prose voice) and the **sign-off name** (the human who's signing the email). Policy:

|                                                                                 | Playbook                                      | Sign-off name                                       |
| ------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| Has requesting user (W5.4 regenerate, owner-compose followup)                   | requesting user's playbook → generic baseline | requesting user.name → mailbox user.name → org name |
| No requesting user (W5.3 initial draft, customer-reply followup, W6.1 check-in) | generic baseline                              | mailbox user.name → org name                        |

Where "mailbox user" = `Opportunity.emailAccount.user` (whoever connected the inbox the conversation lives in). The prior "fall back to org OWNER's playbook" rule was retired because it baked one person's voice into every team member's drafts, and was conceptually wrong on multi-user mailboxes. No one else's playbook is ever used as a fallback for someone else's draft — the explicit choice is generic over wrong-voice. The mailbox user's NAME (not their playbook) provides the sign-off fallback because they're the legal sender of the email even when they didn't write this specific reply.

**21. Silence-check-in scheduler is a cron + fan-out + per-opp processor (W6.1).** Two Inngest functions: `FollowUpSchedulerFunction` (cron `TZ=Europe/Amsterdam 0 8 * * *` daily — 08:00 Amsterdam local time, DST-aware) enumerates eligible REPLIED opps via raw SQL in `repository.findCheckInCandidates` (cap=500/tick) and fans out one `opportunity/silence.followup-due` event per candidate; `FollowUpProcessorFunction` (concurrency=5) receives each event, re-validates eligibility via `reValidateCheckInCandidate` _inside_ the step.run, then calls `ReplyDraftsService.generateCheckInDraft`. Eligibility = `status = REPLIED ∧ not dismissed ∧ latest draft is SENT ∧ (now - latestSentAt) ≥ org.followUpCadenceDays ∧ priorCheckInCount < org.followUpMaxCount ∧ org entitled`. Cap is on `ReplyDraft.kind = CHECK_IN` rows only — owner-initiated drafts don't consume the cap. Setting `Organization.followUpMaxCount = 0` disables the scheduler for the org. Dedicated `buildCheckInPromptNL` prompt (short, polite, no re-quote) keeps the AI from re-pitching; `ReplyDraftGenerator.generateCheckIn` tags the AICall with `purpose: 'reply-draft-check-in'` so the admin AI-usage dashboard can split spend by intent.

**22. Opportunity timeline = `Log`-backed discriminated union, no parallel persistence.** The detail view's `Tijdlijn` panel merges three sources: `replyDraftHistory`, `customerReplies` (existing), AND a new server-built `timeline: OpportunityTimelineEvent[]` discriminated union (kinds: `status_changed | auto_cold | dismissed | undismissed | fields_updated | assigned`). Source actions live in `OPPORTUNITY_TIMELINE_ACTIONS` (`apps/api/src/modules/opportunities/opportunities.repository.ts`): `opportunity.status.updated`, `opportunity.auto_cold.flipped`, `opportunity.dismissed`, `opportunity.undismissed`, `opportunity.fields_updated`, `opportunity.assigned`. `findTimelineEvents` JSON-path-filters Log by `metadata.opportunityId` + `metadata.action ∈ <set>`, cap 200 rows. `toOpportunityTimelineEvent` (service) drops malformed rows (unknown action / missing required keys / invalid enum values) so the FE only ever renders typed events. Adding a new event kind = (a) add the action to `OPPORTUNITY_TIMELINE_ACTIONS`, (b) extend the discriminated union in `apps/shared/src/opportunities.ts`, (c) add a `case` to the mapper + a `case` to `describeTimelineEvent` in the web file. No schema delta.

**23. `actorUserId` is the canonical audit-log key + batched user-label resolution.** Every owner-driven audit log entry on Opportunity (`opportunity.status.updated`, `opportunity.dismissed`, `opportunity.undismissed`, `opportunity.fields_updated`, `opportunity.assigned`) carries `metadata.actorUserId: string`. Reads (`getDetail` for the timeline, `list` for the "Bijgewerkt door X" badge) collect every referenced user ID into a single set + call `repository.findUserDisplayLabels(ids[]) → Map<id, name|email>` for a batched lookup, then zip the labels into the events. `null` actor on a row means system-driven — UI suppresses the "door X" suffix. System-driven events with no actor: `opportunity.auto_cold.flipped` (cron) and `opportunity.received_via_mailbox` (creation-time mailbox attribution; carries `mailboxEmail` + `mailboxOwnerUserId` + `mailboxOwnerName` instead of an actor — renders as "Aanvraag binnengekomen via X" on the timeline). The column-level auto-assignment to the mailbox connector still happens (`assignedToUserId` is set in the create transaction); we deliberately do NOT write an `opportunity.assigned` row for it because the picker already shows the same info — only _manual_ reassignments produce a `Toewijzing` timeline entry.

**24. `assignedToUserId` defaults to the mailbox connector + two-dimensional list filtering.** `Opportunity.assignedToUserId` (UUID, nullable, `ON DELETE SET NULL`) is set in `createOpportunityFromRawMessage`'s transaction to `EmailAccount.userId` (whoever connected the inbox). Manual assignment via `PATCH /api/opportunities/:id/assignee { userId: string | null }` validates org membership before writing (`isUserMemberOfOrganization`) so cross-org assignments 404. List filtering exposes TWO orthogonal URL params: `owner=mine|all` (mailbox-connector-based) + `assignee=me|unassigned|all` (assignment-based). Both filters propagate into `countByStatusForOrganization` so the segmented-tab totals match the visible rows — never lie about funnel state. Composite index `(assignedToUserId, organizationId)` keeps the "Aan mij toegewezen" path an index-only scan.

**25. MUI v6 pickers need `onAccept` + an internal-state mirror for autosave.** `MuiDatePicker` / `MuiDateTimePicker` (and their Mobile twins) require fully-controlled mode — they need the parent to reflect `onChange` back into the `value` prop for the multi-view flow (year → month → day → hour → minute) to advance. If autosave writes the server on every `onChange`, you get N rows per single owner interaction (3-5 audit-log entries for one date pick). `StandaloneDatePicker` + `StandaloneDateTimePicker` own internal local state (`internalValue`, synced from `value` via `useEffect`) so views advance instantly; expose `onAccept` to consumers for the commit signal (desktop: close picker, mobile: tap OK, both: clear via X button). Opp detail page binds `onAccept` (not `onChange`) for `customerDeadline` + `customerAppointment` — one commit per interaction, one audit-log row per real change.

**25b. Dual rawMessage pointers on `Opportunity`.** `Opportunity` carries TWO independent FKs to `RawMessage`:

- `rawMessageId` (`@unique`, `OpportunityOriginatingRawMessage`) — the **oldest** customer-side message in the thread, set by the oldest-first picker. Drives "Originele e-mail" UI + AI extractor input.
- `latestCustomerRawMessageId` (`@unique`, nullable, `OpportunityLatestCustomerRawMessage`) — the **newest** customer-side message in the thread. Drives RFC 2822 threading headers (`In-Reply-To` / `References`) on outbound sends + the AI draft generator's prompt input.

Set to `rawMessageId` at opp creation (originating is the only customer message at that point). Bumped forward by `attachThreadMessage` / `attachFollowupMessage` via a conditional `UPDATE ... WHERE existing.internalDate < candidate.internalDate` (one round-trip; no read-then-write race). Self-emails (own-mailbox outbound) pass `customerInternalDate: null` so they NEVER advance the pointer — using our own outbound's Message-ID for `In-Reply-To` would make recipients see broken parent chains. Both pointers are `@unique` because each RawMessage can only originate / be-latest-for one opp in practice (Prisma also requires unique-on-defining-side for 1:1 relations).

Read sites should prefer the dedicated pointer over computed `take: 1` subqueries on `threadMessages`: faster (no per-row sort), and the maintained pointer guarantees customer-side filtering (the subquery would pick up own-org outbound). `findSendContext` reads `latestCustomerRawMessage.raw`; `findOpportunityForGeneration` reads it too BUT collapses to `null` when `latestCustomerRawMessageId === rawMessageId` so the AI prompt doesn't render the same content under two aliases.

**26. Race-narrowing `UPDATE ... RETURNING` over bulk-mutation + per-id fan-out.** When a bulk write needs side-effects only for the rows that actually changed (notifications, audit log, etc.), `Prisma.updateMany`'s `count` return value isn't enough — it doesn't tell you which rows passed the WHERE guard. Use raw SQL `UPDATE ... RETURNING id` and iterate the resolved subset. Live example: `OpportunitiesRepository.markOpportunitiesCold` returns `string[]` of flipped IDs (not just `count`). The auto-cold scheduler then loops `candidates.filter(x => flippedSet.has(x.opportunityId))` — notifications + the `opportunity.auto_cold.flipped` log row only fire for opps that survived the `status = REPLIED` race (the gap: owner clicked WON between the candidate-fetch query and the bulk update). Same pattern fits any future "scan + bulk-flip + emit" pipeline.

### Accuracy harness workflow (`pnpm test:ai`)

The classifier + extractor each have a live-API accuracy spec. They're **skipped during normal `pnpm test`** because Jest doesn't auto-load `.env` — so unguarded `pnpm test` won't burn OpenAI credit.

To run explicitly (from `apps/api/`):

```bash
pnpm test:ai                  # both harnesses, ~2 min, ~€0.15 of OpenAI credit
pnpm test:ai:classifier       # classifier only
pnpm test:ai:extractor        # extractor only
```

The launcher script (`scripts/run-jest-with-env.cjs`):

1. Loads `apps/api/.env` (picks up `OPENAI_API_KEY`)
2. Sets `AI_REPORT_RUN_ID` env so both specs' results share one run ID
3. Spawns Jest as a child process (so the post-step can run after Jest exits)
4. After Jest exits, calls `scripts/build-ai-report.cjs` → rebuilds `apps/api/.ai-reports/index.html`

**Result:** a fresh HTML report you can open in a browser, grouped by date → run → unified per-fixture row (classifier + extractor combined, with the email body + per-field pass/fail visible on expand). Failing fixtures auto-open; passing ones collapse.

`apps/api/.ai-reports/` is gitignored. Safe to `rm -rf` between iterations.

### Gotchas

| Symptom                                                                                   | Fix                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:ai` says "skipping live accuracy test" even though `.env` has `OPENAI_API_KEY` | `apps/api/.env` not loaded by Jest. Run via `pnpm test:ai` (not `pnpm exec jest accuracy`); the launcher script does the `dotenv` load.                                |
| Azure OpenAI returns 400 on every call                                                    | `AZURE_OPENAI_API_VERSION` predates Responses API. Bump to ≥ `2025-03-01-preview`.                                                                                     |
| Classifier reasoning is always 3 sentences                                                | The schema field is `reason` (not `reasoning`) — the name primes the model toward a one-liner. If you renamed it back, output grows.                                   |
| Extractor returns the same `customerDeadline` value as `customerAppointment`              | The prompt rule for `customerDeadline` says "inspection dates do NOT go here." Verify the model isn't conflating; the rule is enforced by prompt text, not the schema. |

See `TEST_CASES.md` → Opportunities (W4.4 + W4.5), Dismiss feedback (OPP-DISMISS-01..N), and Classifier quality dashboard (CQ-01..N) for the user-observable behavior catalog.
