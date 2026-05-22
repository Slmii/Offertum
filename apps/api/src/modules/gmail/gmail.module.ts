import { AuthModule } from '@/modules/auth/auth.module';
import { EmailAccountsModule } from '@/modules/email-accounts/email-accounts.module';
import { GmailApiService } from '@/modules/gmail/gmail-api.service';
import { GmailBackfillService } from '@/modules/gmail/gmail-backfill.service';
import { GmailDeltaSyncService } from '@/modules/gmail/gmail-delta-sync.service';
import { GmailWatchService } from '@/modules/gmail/gmail-watch.service';
import { GmailController } from '@/modules/gmail/gmail.controller';
import { GmailWebhookController } from '@/modules/gmail/gmail-webhook.controller';
import { Module } from '@nestjs/common';

/**
 * Gmail integration ( +  + ). Hosts the Gmail-specific HTTP routes, REST
 * client, backfill worker, delta-sync worker, and watch lifecycle service.
 *
 * Account-management services (`EmailAccountsService` + `GoogleOAuthService`) come from
 * `EmailAccountsModule` — those are shared across providers and live there to avoid
 * a circular dep with `MicrosoftModule`.
 *
 * Member-or-owner write routes use `@MemberWrite` (entitlement-gated). Status + messages
 * reads use `TenantMemberGuard` alone. EXTERNAL is rejected at the guard layer.
 *
 * Services are exported so the InngestModule's function wrappers can inject them.
 */
@Module({
	imports: [AuthModule, EmailAccountsModule],
	controllers: [GmailController, GmailWebhookController],
	providers: [GmailApiService, GmailBackfillService, GmailDeltaSyncService, GmailWatchService],
	exports: [GmailApiService, GmailBackfillService, GmailDeltaSyncService, GmailWatchService]
})
export class GmailModule {}
