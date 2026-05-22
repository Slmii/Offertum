import { GmailModule } from '@/modules/gmail/gmail.module';
import { MicrosoftModule } from '@/modules/microsoft/microsoft.module';
import { FollowUpProcessorFunction } from '@/modules/inngest/functions/follow-up-processor.function';
import { FollowUpSchedulerFunction } from '@/modules/inngest/functions/follow-up-scheduler.function';
import { GmailBackfillFunction } from '@/modules/inngest/functions/gmail-backfill.function';
import { GmailDeltaSyncFunction } from '@/modules/inngest/functions/gmail-delta-sync.function';
import { GmailWatchRenewalFunction } from '@/modules/inngest/functions/gmail-watch-renewal.function';
import { MicrosoftBackfillFunction } from '@/modules/inngest/functions/microsoft-backfill.function';
import { MicrosoftDeltaSyncFunction } from '@/modules/inngest/functions/microsoft-delta-sync.function';
import { MicrosoftSubscriptionRenewalFunction } from '@/modules/inngest/functions/microsoft-subscription-renewal.function';
import { ReplyDraftGenerateFunction } from '@/modules/inngest/functions/reply-draft-generate.function';
import { WeeklyDigestFunction } from '@/modules/inngest/functions/weekly-digest.function';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { OpportunitiesModule } from '@/modules/opportunities/opportunities.module';
import { ReplyDraftsModule } from '@/modules/reply-drafts/reply-drafts.module';

/**
 * Inngest itself is wired as Express middleware in `main.ts` — same pattern as Auth.js.
 * What this module does is house the `@Injectable()` wrappers that expose Inngest
 * functions needing Nest DI (services, Prisma, etc.). main.ts resolves each wrapper via
 * `app.get(...)` after `NestFactory.create()` and adds its `.inngestFn` to the array
 * passed to `serve()`.
 *
 * Trivial functions that don't need DI (the `helloFn` and `heartbeatFn`) live as
 * free constants in `functions/index.ts` and don't go through Nest. Mixed-mode is fine —
 * the `serve()` array just gets both flavors concatenated.
 */
@Module({
	imports: [GmailModule, MicrosoftModule, OpportunitiesModule, ReplyDraftsModule, NotificationsModule],
	providers: [
		GmailBackfillFunction,
		GmailDeltaSyncFunction,
		GmailWatchRenewalFunction,
		MicrosoftBackfillFunction,
		MicrosoftDeltaSyncFunction,
		MicrosoftSubscriptionRenewalFunction,
		ReplyDraftGenerateFunction,
		FollowUpSchedulerFunction,
		FollowUpProcessorFunction,
		WeeklyDigestFunction
	],
	exports: [
		GmailBackfillFunction,
		GmailDeltaSyncFunction,
		GmailWatchRenewalFunction,
		MicrosoftBackfillFunction,
		MicrosoftDeltaSyncFunction,
		MicrosoftSubscriptionRenewalFunction,
		ReplyDraftGenerateFunction,
		FollowUpSchedulerFunction,
		FollowUpProcessorFunction,
		WeeklyDigestFunction
	]
})
export class InngestModule {}
