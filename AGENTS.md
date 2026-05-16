# AGENTS.md

Project-level instructions for agents working in this repository. Treat this file as the first local reference, then read `CLAUDE.md` for the full architecture notes and current gotchas.

## 1. Response Format

Always use this numbered structure in user-facing replies after code work:

1. **Analysis** - Risks, bugs, optimizations, and opportunities.
2. **What you changed** - Concise summary of edits.
3. **Why you changed it** - How the change improves quality using industry best practices.

Keep responses direct and concise. If tests were not run, say that explicitly.

## 2. Working Agreements

- Work directly on `main` unless the user explicitly asks for a branch.
- Do not commit, push, or open a PR unless the user explicitly asks.
- Do not run terminal commands unless the user explicitly asks or the command is required to complete the requested change.
- Prefer `pnpm` for installs and scripts.
- Ask before adding production dependencies.
- Run `pnpm test` after changing JavaScript or TypeScript files.
- Also run focused tests, `pnpm typecheck`, or `pnpm lint` when the touched area warrants it.
- Keep `.env.example` in sync with `apps/api/src/config/env.schema.ts` when adding or changing env vars.
- Audit docs after feature work: `README.md`, `CLAUDE.md`, `TEST_CASES.md`, and the build plan if behavior/status changes.

## 3. Project Summary

Quoteom is an AI offerte management app for Dutch SMBs. It reads email and WhatsApp requests, extracts quote opportunities, drafts replies in the owner's tone, generates quote PDFs, and tracks deadlines, expiry, and follow-ups.

Core stack:

- Monorepo: Turborepo with `pnpm` workspaces.
- Web: TanStack Start, React 19, Vite, MUI, TanStack Query.
- API: NestJS 11, Express, CommonJS, Prisma 7, Postgres 16.
- Auth: Auth.js v5 at `/api/auth/*`, JWT sessions, magic links, Google, Microsoft Entra.
- Billing: Stripe, pinned API version `2026-04-22.dahlia`, graduated seat pricing.
- AI: OpenAI Responses API via `openai` SDK behind the `AI_CLIENT` provider seam.
- Jobs: Inngest v4 at `/api/inngest`.

Authoritative references:

- `CLAUDE.md` - detailed architecture and implementation conventions.
- `TEST_CASES.md` - behavior and QA catalog.
- `~/.claude/plans/toasty-herding-giraffe.md` - week-by-week plan and status.
- `HANDOFF.md` - latest session handoff when present.

## 4. Commands

Run from the repository root unless noted:

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm format
pnpm test
```

API-specific commands from `apps/api/`:

```bash
pnpm db:up
pnpm db:down
pnpm db:migrate
pnpm db:deploy
pnpm db:generate
pnpm db:studio
pnpm db:seed
pnpm dev
```

Web-specific commands from `apps/web/`:

```bash
pnpm dev
pnpm build
pnpm start
pnpm test
```

Live AI accuracy tests require `OPENAI_API_KEY` and should only be run intentionally:

```bash
cd apps/api
pnpm test:ai
pnpm test:ai:classifier
pnpm test:ai:extractor
```

## 5. Repository Layout

API source lives under `apps/api/src/`:

- `common/` - guards, decorators, filters, shared DTOs.
- `config/` - Zod env schema and config setup.
- `lib/errors.ts` - single source of truth for thrown error messages.
- `lib/mails/` - Resend email templates.
- `generated/prisma/` - generated Prisma client.
- `modules/` - all NestJS modules.
- `modules/ai/` - AI wrapper, classifier, extractor, AI call logging.
- `modules/gmail/`, `modules/microsoft/`, `modules/email-accounts/` - mailbox integration.
- `modules/inngest/` - background job registration and functions.

Web source lives under `apps/web/src/`:

- `routes/` - TanStack Start routes.
- `lib/api/` - server functions, SSR-safe fetch, browser API client.
- `lib/queries/` - `queryOptions` and mutation hooks.
- `lib/schemas/` - Zod schemas.
- `lib/utils/` - theme, page metadata, helpers.

Shared FE/BE types live under `apps/shared/`.

## 6. API Architecture Rules

- Keep all API modules under `apps/api/src/modules/<feature>/`.
- New modules should have a module, service, controller, and DTO folder when they expose HTTP behavior.
- Use path aliases `@/*` for API source and `@db/*` for Prisma client imports.
- Do not add `.js` suffixes to NestJS imports.
- Use `async/await` and robust error handling.
- Validate every API input.
- Defend tenant boundaries on every query and mutation.

Use the correct request gate:

- `@UseGuards(OrganizationGuard)` for tenant reads.
- `@TenantWrite()` for tenant writes that require entitlement.
- `@UseGuards(OwnerGuard)` for owner-only reads/actions that do not need entitlement.
- `@OwnerWrite()` for owner-only writes that require entitlement.

Controller rules:

- Controller methods must return typed DTO classes.
- Decorate responses with `@ApiOkResponse({ type: TheDto })`.
- Use `[TheDto]` for array responses.
- Do not expose TypeScript interfaces across controller boundaries because they are erased from OpenAPI metadata.

Error and logging rules:

- Put thrown error messages in `apps/api/src/lib/errors.ts`.
- Use constants for static messages and functions for templated messages.
- Do not inline thrown strings in services, guards, or controllers.
- Persisted logs go through `LogService.logAction({ action, message, metadata, level })`.
- Do not use raw `console.*` in API code after Nest bootstraps.
- `console.*` is acceptable only for pre-DI bootstrap code or temporary local debugging.

Config rules:

- In Nest-managed code, read env through `ConfigService<EnvSchema, true>`.
- Raw `process.env` is reserved for pre-DI code such as auth config, env loading, mail setup, and seed scripts.
- Per-app `.env` files only; do not add root-level app env files.

## 7. Web Architecture Rules

- Functional React components only.
- Use named exports for components and utilities.
- Follow the existing route and query layout.
- Use semantic HTML and accessible controls.
- Keep components small and focused.

Every GET must use the SSR query pattern:

1. Create a `createServerFn` handler that calls `serverFetch(...)`.
2. Wrap it in `queryOptions(...)`.
3. Prefetch in the route `loader` with `context.queryClient.ensureQueryData(...)`.
4. Read in the component with `useSuspenseQuery(...)`.

Do not use bare `useQuery` for route-level GETs.

Mutation rules:

- Use `useMutation` with the browser `api()` client for POST, PATCH, and DELETE.
- Invalidate affected queries with their existing `queryKey`.
- Use hard navigation after auth-cookie mutations when required by SSR hydration behavior.

SSR formatting rules:

- Do not use `toLocaleDateString(undefined, ...)` or `Intl.*Format()` with implicit locale in SSR-rendered components.
- Use `dayjs(date).format(...)` for dates.
- Use deterministic currency helpers instead of implicit-locale formatting.

## 8. AI Pipeline Rules

- Use the `AI_CLIENT` injection token; downstream services must not depend directly on OpenAI.
- Use OpenAI Responses API, not Chat Completions.
- Use structured outputs via `zodTextFormat`.
- Set `store: false` on every OpenAI call.
- Persist AI activity through `AICallLogger`; do not bypass the `AICall` audit trail.
- Preserve the provider seam so W5.1 provider comparison remains a DI/config change, not a service rewrite.
- Keep Dutch prompts under locale-specific prompt files.
- Treat `customerAppointment` separately from `customerDeadline`.

## 9. Coding Standards

- TypeScript everywhere.
- ES module style with destructured imports where the package and local style support it.
- Prefer clarity over cleverness.
- Keep functions small and single-purpose.
- Reuse existing helpers and patterns before adding abstractions.
- Add comments only for complex logic; comments should start with a capital letter.
- Follow ESLint and Prettier.
- Use named exports; avoid default exports.
- File names for React components should follow the existing PascalCase component convention.

Type and interface ordering:

1. Required primitive values.
2. Required booleans.
3. Required functions.
4. Optional primitive values.
5. Optional booleans.
6. Optional functions.

Boolean names should use `is`, `has`, `can`, or `should` prefixes.

## 10. Testing And Quality

- Add or update tests when behavior changes.
- Run `pnpm test` after JavaScript or TypeScript edits.
- For API changes, run focused Jest specs when possible.
- For web changes, run focused Vitest specs when possible.
- Run `pnpm typecheck` for shared types, DTO changes, Prisma changes, or cross-package edits.
- Run `pnpm lint` when changing patterns likely to trigger lint rules.
- Note test gaps in the final response.

## 11. Security And Data

- Never log secrets, tokens, magic links, invitation tokens, OAuth credentials, raw customer data, or AI prompt payloads outside the approved persistence layer.
- Sanitize external input.
- Keep tenant filters explicit.
- Default to least privilege for services, tokens, and database access.
- Keep OAuth callback and invitation flows entitlement-aware.
- Keep Auth.js cookie behavior protocol-aware; secure cookie names affect JWT salt.
- Preserve `store: false` for OpenAI calls.

## 12. Known Gotchas

- Vite dev proxies `/api/*` to the API with `changeOrigin: false`; do not change this because Auth.js cookie scoping depends on it.
- SSR fetches must use absolute URLs and forwarded cookies through `serverFetch(...)`.
- Auth.js chooses session cookie names based on protocol and `AUTH_URL`; cookie name is also the JWT salt.
- `AUTH_URL` should generally be unset in local dev so `trustHost: true` can handle localhost and ngrok.
- Stripe webhook processing should return quickly and process tracked events through the existing sync path.
- `BillingService.syncFromStripe(customerId)` is the only path that writes subscription state.
- Do not pass `payment_method_types` to Stripe Checkout or SetupIntents.
- Inngest production auth with `INNGEST_SIGNING_KEY` is a deferred pre-launch security item.
- At-rest encryption for `RawMessage` body and `AICall` prompt/response is a deferred pre-launch security item.
