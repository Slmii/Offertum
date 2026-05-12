import { AuthModule } from '@/modules/auth/auth.module';
import { EmailAccountsService } from '@/modules/gmail/email-accounts.service';
import { GmailApiService } from '@/modules/gmail/gmail-api.service';
import { GmailController } from '@/modules/gmail/gmail.controller';
import { GoogleOAuthService } from '@/modules/gmail/google-oauth.service';
import { Module } from '@nestjs/common';

/**
 * W3.1 — Gmail OAuth + token storage.
 *
 * Provides:
 *  - `GoogleOAuthService` — pure OAuth2 client (authorize URL, exchange, refresh, revoke, userinfo).
 *  - `GmailApiService`    — thin Gmail v1 REST wrapper (list + get message metadata for now).
 *  - `EmailAccountsService` — Prisma + encryption layer; transparently refreshes tokens on demand.
 *
 * Owner-only routes (`@UseGuards(OwnerGuard)`) — connecting a mailbox grants the whole
 * org access to that inbox via the platform, so we keep it to the owner role for now.
 * Loosen when multi-mailbox / per-user routing arrives.
 */
@Module({
	imports: [AuthModule],
	controllers: [GmailController],
	providers: [GoogleOAuthService, GmailApiService, EmailAccountsService],
	exports: [EmailAccountsService, GmailApiService]
})
export class GmailModule {}
