// Must be the first import — populates process.env before any other module's
// top-level code (e.g. auth.config's PrismaClient) reads from it.
import '@/load-env';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { authRateLimitMiddleware } from '@/common/middleware/auth-rate-limit.middleware';
import { buildDocsBasicAuthMiddleware } from '@/common/middleware/docs-basic-auth.middleware';
import { requestContextMiddleware } from '@/common/middleware/request-context.middleware';
import type { EnvSchema } from '@/config/env.schema';
import { authConfig } from '@/modules/auth/auth.config';
import { inngestFunctions } from '@/modules/inngest/functions';
import { AutoColdSchedulerFunction } from '@/modules/inngest/functions/auto-cold-scheduler.function';
import { FollowUpProcessorFunction } from '@/modules/inngest/functions/follow-up-processor.function';
import { FollowUpSchedulerFunction } from '@/modules/inngest/functions/follow-up-scheduler.function';
import { GmailBackfillFunction } from '@/modules/inngest/functions/gmail-backfill.function';
import { GmailDeltaSyncFunction } from '@/modules/inngest/functions/gmail-delta-sync.function';
import { GmailWatchRenewalFunction } from '@/modules/inngest/functions/gmail-watch-renewal.function';
import { MicrosoftBackfillFunction } from '@/modules/inngest/functions/microsoft-backfill.function';
import { MicrosoftDeltaSyncFunction } from '@/modules/inngest/functions/microsoft-delta-sync.function';
import { MicrosoftSubscriptionRenewalFunction } from '@/modules/inngest/functions/microsoft-subscription-renewal.function';
import { PricingPlaybookCompileFunction } from '@/modules/inngest/functions/pricing-playbook-compile.function';
import { ReplyDraftGenerateFunction } from '@/modules/inngest/functions/reply-draft-generate.function';
import { WeeklyDigestFunction } from '@/modules/inngest/functions/weekly-digest.function';
import { inngest } from '@/modules/inngest/inngest.client';
import { LogService } from '@/modules/logger/log.service';
import { ExpressAuth } from '@auth/express';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { serve as inngestServe } from 'inngest/express';
import 'reflect-metadata';

async function bootstrap() {
	// `rawBody: true` exposes `request.rawBody` so the Stripe webhook handler can verify
	// the signature header against the unparsed request body. Without it Stripe's
	// `constructEvent()` always throws.
	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		bufferLogs: true,
		rawBody: true
	});

	app.useLogger(app.get(LogService));

	// Register NestJS's JSON body parser EXPLICITLY — and BEFORE any `app.use()` calls
	// below. Without this, NestJS registers its parsers lazily during `app.init()`,
	// which fires AFTER the `app.use('/api/inngest', ...)` mount — leaving Inngest with
	// no body to read (it 401s; we saw this before this fix). The path-scoped
	// `expressJson()` workaround had a side effect of breaking body parsing on OTHER
	// routes (e.g. POST /api/me/switch-organization), so we do it the right way per
	// Inngest's NestJS docs: tell Nest to install its parsers now.
	//
	// 10mb limit covers Gmail's larger full-message payloads on the webhook path.
	app.useBodyParser('json', { limit: '10mb' });

	const config = app.get(ConfigService<EnvSchema, true>);

	// Behind App Platform's load balancer the real client IP arrives in `X-Forwarded-For`.
	// Without this, `req.ip` is the LB's IP and per-IP rate limits become per-app limits.
	// `1` = trust the single proxy hop in front of us (App Platform). Bump if more layers.
	app.getHttpAdapter().getInstance().set('trust proxy', 1);

	app.enableCors({
		origin: config.get('WEB_ORIGIN', { infer: true }),
		credentials: true
	});
	app.setGlobalPrefix('api');

	// Request-scoped log context (AsyncLocalStorage). Mounted FIRST so every downstream
	// handler — Auth.js, Inngest, Nest controllers — runs inside an ALS frame and any log
	// emitted during the request inherits a stable `requestId`. AuthGuard / OrganizationGuard
	// push `userId` / `organizationId` into the same store once auth resolves. The LogService
	// reads it on every persist call so the `Log` table rows are correlatable end-to-end.
	app.use(requestContextMiddleware);

	// Auth.js — mounted as Express middleware on /api/auth/*.
	// Sits before global pipes/filters because it handles its own request/response lifecycle.
	// The rate-limit middleware runs FIRST so abusive POSTs (magic-link emit, enumeration)
	// get 429'd before ExpressAuth ever sees them. Skipped in development — local invite /
	// delete-user / sign-in iteration burns through the per-email budget within minutes.
	if (config.get('NODE_ENV', { infer: true }) === 'production') {
		app.use('/api/auth', authRateLimitMiddleware, ExpressAuth(authConfig));
	} else {
		app.use('/api/auth', ExpressAuth(authConfig));
	}

	// Inngest — mounted at /api/inngest. Handles 3 verbs internally:
	//   - GET:  discovery + introspection (used by the dev UI to list functions)
	//   - PUT:  register functions with the cloud (no-op in dev)
	//   - POST: run a step (called by the Inngest runtime when a function fires)
	// Like Auth.js, Inngest's serve() owns the response — keep it before global pipes.
	// Signing key is auto-read from `INNGEST_SIGNING_KEY` env (handled by the SDK).
	//
	// JSON body parsing happens upstream of this mount via `app.useBodyParser(...)` above —
	// no path-scoped `expressJson()` workaround needed. Stripe's webhook still gets `rawBody`
	// because `NestFactory.create({ rawBody: true })` instructs the parser to capture both.
	//
	// Function list combines:
	//   - free-function smoke functions (no Nest DI) from `functions/index.ts`
	//   - DI-aware `@Injectable()` wrappers — each exposes `.inngestFn`. New wrappers add
	//     a class entry to `InngestModule` providers + a `.get()` line here.
	const gmailBackfill = app.get(GmailBackfillFunction);
	const gmailDeltaSync = app.get(GmailDeltaSyncFunction);
	const gmailWatchRenewal = app.get(GmailWatchRenewalFunction);
	const microsoftBackfill = app.get(MicrosoftBackfillFunction);
	const microsoftDeltaSync = app.get(MicrosoftDeltaSyncFunction);
	const microsoftSubscriptionRenewal = app.get(MicrosoftSubscriptionRenewalFunction);
	const replyDraftGenerate = app.get(ReplyDraftGenerateFunction);
	const followUpScheduler = app.get(FollowUpSchedulerFunction);
	const followUpProcessor = app.get(FollowUpProcessorFunction);
	const weeklyDigest = app.get(WeeklyDigestFunction);
	const autoColdScheduler = app.get(AutoColdSchedulerFunction);
	const pricingPlaybookCompile = app.get(PricingPlaybookCompileFunction);
	app.use(
		'/api/inngest',
		inngestServe({
			client: inngest,
			functions: [
				...inngestFunctions,
				gmailBackfill.inngestFn,
				gmailDeltaSync.inngestFn,
				gmailWatchRenewal.inngestFn,
				microsoftBackfill.inngestFn,
				microsoftDeltaSync.inngestFn,
				microsoftSubscriptionRenewal.inngestFn,
				replyDraftGenerate.inngestFn,
				followUpScheduler.inngestFn,
				followUpProcessor.inngestFn,
				weeklyDigest.inngestFn,
				autoColdScheduler.inngestFn,
				pricingPlaybookCompile.inngestFn
			]
		})
	);

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: { enableImplicitConversion: true }
		})
	);
	app.useGlobalFilters(new AllExceptionsFilter());

	const swaggerConfig = new DocumentBuilder()
		.setTitle('Quoteom API')
		.setDescription('Quote management')
		.setVersion('0.0.0')
		.addBearerAuth()
		.build();

	const document = SwaggerModule.createDocument(app, swaggerConfig);

	// Basic-auth gate on the docs UI + raw OpenAPI JSON. Both env vars set →
	// middleware enforces auth. Either unset → middleware skipped + warn log so dev
	// stays frictionless. The env schema requires both when `NODE_ENV=production`,
	// so an unset-in-prod state can never reach this branch.
	const docsAuth = buildDocsBasicAuthMiddleware({
		username: config.get('DOCS_USERNAME', { infer: true }),
		password: config.get('DOCS_PASSWORD', { infer: true })
	});
	if (docsAuth) {
		app.use(['/docs', '/docs/openapi.json'], docsAuth);
	} else {
		new Logger('Bootstrap').warn(
			'Swagger docs at /docs are UNAUTHENTICATED — set DOCS_USERNAME + DOCS_PASSWORD to enable basic auth.'
		);
	}

	SwaggerModule.setup('docs', app, document, {
		jsonDocumentUrl: 'docs/openapi.json'
	});

	const port = config.get('API_PORT', { infer: true });
	await app.listen(port);

	const bootLog = new Logger('Bootstrap');
	bootLog.log(`API listening on http://localhost:${port}`);
	bootLog.log(`Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
