import { AiModule } from '@/modules/ai/ai.module';
import { EmailAccountsModule } from '@/modules/email-accounts/email-accounts.module';
import { GmailModule } from '@/modules/gmail/gmail.module';
import { MicrosoftModule } from '@/modules/microsoft/microsoft.module';
import { ReplyDraftsRepository } from '@/modules/reply-drafts/reply-drafts.repository';
import { ReplyDraftsService } from '@/modules/reply-drafts/reply-drafts.service';
import { Module } from '@nestjs/common';

/**
 * W5.3 — reply-draft generation. Composes the AI generator (`ReplyDraftGenerator` in
 * `AiModule`) with a Prisma-backed repository to produce `ReplyDraft` rows after each
 * Opportunity is created. The Inngest function `reply-draft-generate` is the primary
 * caller; W5.4 added the manual "regenerate" affordance.
 *
 * W5.5 — adds `send()` which routes the draft body through Gmail / Microsoft Graph as
 * a threaded reply. Needs `EmailAccountsModule` (OAuth token refresh), `GmailModule`
 * (`users.messages.send`), and `MicrosoftModule` (Graph `/me/sendMail`).
 *
 * Exports `ReplyDraftsService` so the Inngest module + the opportunities controller can
 * call it without re-importing the dependency chain.
 */
@Module({
	imports: [AiModule, EmailAccountsModule, GmailModule, MicrosoftModule],
	providers: [ReplyDraftsService, ReplyDraftsRepository],
	// `ReplyDraftsRepository` exported so the W6.1 `FollowUpSchedulerFunction` (in
	// InngestModule) can run its candidate-enumeration query directly without going
	// through the service. The processor still uses the service.
	exports: [ReplyDraftsService, ReplyDraftsRepository]
})
export class ReplyDraftsModule {}
