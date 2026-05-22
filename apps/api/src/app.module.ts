import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { validateEnv } from '@/config/env.schema';
import { AttachmentStorageModule } from '@/lib/storage/attachment-storage.module';
import { AiModule } from '@/modules/ai/ai.module';
import { AIUsageModule } from '@/modules/ai-usage/ai-usage.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { BillingModule } from '@/modules/billing/billing.module';
import { ClassifierQualityModule } from '@/modules/classifier-quality/classifier-quality.module';
import { EmailAccountsModule } from '@/modules/email-accounts/email-accounts.module';
import { GmailModule } from '@/modules/gmail/gmail.module';
import { InngestModule } from '@/modules/inngest/inngest.module';
import { InvitationsModule } from '@/modules/invitations/invitations.module';
import { MicrosoftModule } from '@/modules/microsoft/microsoft.module';
import { LogModule } from '@/modules/logger/log.module';
import { MeModule } from '@/modules/me/me.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { OpportunitiesModule } from '@/modules/opportunities/opportunities.module';
import { PrismaModule } from '@/modules/prisma/prisma.module';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { ReplyDraftsModule } from '@/modules/reply-drafts/reply-drafts.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

@Module({
	imports: [
		// Global ConfigModule — ConfigService is injectable everywhere without re-importing.
		// `validate` runs the Zod schema against process.env at boot; bad env = startup fails.
		ConfigModule.forRoot({
			isGlobal: true,
			validate: validateEnv,
			cache: true
		}),

		// Per-IP rate limiting. Defaults are deliberately loose — only abuse-prone routes
		// (signup, magic-link request) tighten via `@Throttle()`. Stripe's webhook is
		// `@SkipThrottle()`-ed below since Stripe retries aggressively on transient failures.
		// `trust proxy` is set in main.ts so request IPs come from X-Forwarded-For in prod
		// (App Platform load balancer).
		ThrottlerModule.forRoot([
			{ name: 'default', ttl: 60_000, limit: 60 } // 60 requests / minute / IP, global
		]),

		PrismaModule,
		LogModule,
		AttachmentStorageModule,
		AuthModule,
		InvitationsModule,
		MeModule,
		NotificationsModule,
		BillingModule,
		EmailAccountsModule,
		GmailModule,
		MicrosoftModule,
		OpportunitiesModule,
		ReplyDraftsModule,
		InngestModule,
		AiModule,
		AIUsageModule,
		ClassifierQualityModule
	],
	controllers: [AppController],
	providers: [AppService, PrismaService, { provide: APP_GUARD, useClass: ThrottlerGuard }]
})
export class AppModule {}
