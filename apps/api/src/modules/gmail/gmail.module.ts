import { AuthModule } from '@/modules/auth/auth.module';
import { EmailAccountsService } from '@/modules/gmail/email-accounts.service';
import { GmailApiService } from '@/modules/gmail/gmail-api.service';
import { GmailBackfillService } from '@/modules/gmail/gmail-backfill.service';
import { GmailController } from '@/modules/gmail/gmail.controller';
import { GoogleOAuthService } from '@/modules/gmail/google-oauth.service';
import { Module } from '@nestjs/common';

/**
 * Gmail integration (W3.1 + W3.4).
 *
 * Provides:
 *  - `GoogleOAuthService`     — pure OAuth2 client (authorize URL, exchange, refresh, revoke, userinfo).
 *  - `GmailApiService`        — thin Gmail v1 REST wrapper.
 *  - `EmailAccountsService`   — Prisma + encryption layer; transparently refreshes tokens on demand.
 *  - `GmailBackfillService`   — W3.4 worker logic; paginates last 30 days into `RawMessage` rows.
 *
 * Member-or-owner write routes use `@MemberWrite()` (entitlement-gated). Status + messages
 * reads use `TenantMemberGuard` alone. EXTERNAL is rejected at the guard layer.
 *
 * `GmailBackfillService` is exported so the InngestModule's `GmailBackfillFunction`
 * wrapper can inject it. The function itself is registered in InngestModule, not here.
 */
@Module({
	imports: [AuthModule],
	controllers: [GmailController],
	providers: [GoogleOAuthService, GmailApiService, EmailAccountsService, GmailBackfillService],
	exports: [EmailAccountsService, GmailApiService, GmailBackfillService]
})
export class GmailModule {}
