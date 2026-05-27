import { PrismaClient } from '@/generated/prisma/client';
import { SELF_SIGNUP_DISABLED } from '@/lib/errors';
import { buildMagicLinkEmail } from '@/lib/mails/magic-link.email';
import { sendEmail } from '@/lib/mails/send';
import { withEncryptedAccountTokens } from '@/modules/auth/encrypted-account-adapter';
import type { ExpressAuthConfig } from '@auth/express';
import GoogleProvider from '@auth/express/providers/google';
import MicrosoftEntra from '@auth/express/providers/microsoft-entra-id';
import ResendProvider from '@auth/express/providers/resend';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

const logger = new Logger('Auth');

// Auth.js needs the raw PrismaClient (its adapter introspects model names at construction).
// We construct a dedicated instance here rather than reusing PrismaService because the auth
// handler is mounted as Express middleware in main.ts — outside the NestJS DI lifecycle.
// Connection pooling still funnels to the same Postgres instance.
const authPrisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
});

const WEB_ORIGIN = `${process.env.WEB_ORIGIN}`;

// Block Auth.js from auto-creating users. Sign-in is for already-provisioned accounts only;
// new users must arrive via an Invitation (created by Offertum admin).
const baseAdapter = PrismaAdapter(authPrisma as never);
const adapter = withEncryptedAccountTokens({
	...baseAdapter,
	createUser: () => {
		throw new Error(SELF_SIGNUP_DISABLED);
	}
});

const providers: ExpressAuthConfig['providers'] = [
	ResendProvider({
		apiKey: `${process.env.RESEND_API_KEY}`,
		from: `${process.env.RESEND_EMAIL_FROM}`,
		sendVerificationRequest: async ({ identifier: to, url }) => {
			// First gate: only send to addresses that already have a User row.
			// Unknown addresses silently succeed (no email, no error) so attackers can't
			// enumerate registered accounts.
			//
			// Case-INsensitive match — Auth.js passes `identifier` exactly as the user typed.
			// Our User rows are lowercased on write, but a user can type `JOHN@x.com` on the
			// sign-in form. A case-sensitive lookup would silently drop the magic-link request.
			// Mirrors the pattern in `InvitationsService.accept`.
			const existing = await authPrisma.user.findFirst({
				where: { email: { equals: to, mode: 'insensitive' } },
				select: { id: true }
			});
			if (!existing) {
				logger.warn(`Sign-in attempted for unknown email: ${to}`);
				return;
			}

			const { host } = new URL(url);
			const { html, text } = buildMagicLinkEmail(url);

			await sendEmail({
				to,
				subject: `Sign in to ${host}`,
				html,
				text,
				devFallbackLog: `Magic link for ${to}:\n  ${url}`
			});
		}
	})
];

// `allowDangerousEmailAccountLinking` invariant (applies to every provider below):
// only set this to `true` on OAuth providers that GUARANTEE `email_verified: true` on
// their userinfo response. With the flag, Auth.js auto-links a new Account row to an
// existing User row sharing the same email — saves an `OAuthAccountNotLinked` error for
// users who signed up via magic link and later try OAuth. Without it the user sees a
// confusing "no account linked" page.
//
// Today's two providers:
//  - Google verifies emails before issuing them (and won't let a third party claim a
//    domain they don't own).
//  - Microsoft Entra: work-tenant administrators can mutate the user's `email` claim,
//    so the address itself isn't an attestation. We compensate with the `signIn`
//    callback below, which refuses any OAuth sign-in lacking `email_verified: true` on
//    the profile. With that check in place, linking by email is still safe — but the
//    guarantee comes from our callback, not from the provider's defaults.
//
// Before adding a NEW provider here, check that its userinfo response includes
// `email_verified: true`. If it doesn't (Apple Hide-My-Email, niche enterprise SSO,
// Twitter/Reddit-style providers), leave the flag OFF for that one provider — Auth.js
// scopes the setting per provider.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
	providers.push(
		GoogleProvider({
			clientId: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
			allowDangerousEmailAccountLinking: true
		})
	);
}

if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
	providers.push(
		MicrosoftEntra({
			clientId: process.env.MICROSOFT_CLIENT_ID,
			clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
			issuer: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID ?? 'common'}/v2.0`,
			allowDangerousEmailAccountLinking: true
		})
	);
}

export const authConfig: ExpressAuthConfig = {
	adapter,
	trustHost: true,
	session: { strategy: 'jwt' },
	providers,
	callbacks: {
		// Hard gate on OAuth sign-in: refuse any IdP profile that doesn't attest the email
		// is verified. Without this, a Microsoft Entra work-tenant admin (who can edit the
		// user's `email` claim) could re-point an existing email at a different user — and
		// because `allowDangerousEmailAccountLinking: true` auto-links by email, that would
		// hand them access to the matching Offertum User row.
		//
		// The check only runs for OAuth providers (account.type === 'oauth' | 'oidc');
		// magic-link sign-ins skip it because Resend deliver-to-inbox proves possession
		// of the address. We refuse if `email_verified` is missing or falsy — neither true
		// nor undefined is a pass. Returning false makes Auth.js route the browser to
		// `pages.error` (= /sign-in) with `?error=AccessDenied`.
		async signIn({ account, profile }) {
			if (!account || (account.type !== 'oauth' && account.type !== 'oidc')) {
				return true;
			}

			const verified =
				profile && typeof profile === 'object' && 'email_verified' in profile
					? profile.email_verified
					: undefined;

			if (verified !== true) {
				logger.warn(
					`OAuth sign-in refused (email_verified=${String(verified)}) for provider=${account.provider}`
				);
				return false;
			}

			return true;
		},
		// Auth.js defaults post-signin redirects to the auth handler's own origin (the API,
		// which has nothing at `/`). Rewrite same-origin redirects to point at the web app.
		async redirect({ url, baseUrl }) {
			if (url.startsWith(baseUrl)) {
				return url.replace(baseUrl, WEB_ORIGIN);
			}

			if (url.startsWith('/')) {
				return `${WEB_ORIGIN}${url}`;
			}

			if (url.startsWith(WEB_ORIGIN)) {
				return url;
			}

			return WEB_ORIGIN;
		},
		// On sign-in, enrich the JWT with `userId` so we don't have to hit the DB to look it
		// up by email on every request. Active organization is NOT cached here — it's read
		// fresh from `User.currentOrganizationId` by OrganizationGuard so switch-org takes
		// effect immediately.
		//
		// On every subsequent request, re-verify the `userId` still points at a live row.
		// Returning `null` from this callback makes Auth.js treat the session as invalid
		// and clear the cookie. Without this check, JWT sessions survive User-row deletion
		// for up to the cookie's 30-day lifetime — the user appears "logged in" to the web
		// shell (the session endpoint returns the JWT contents verbatim) and only the first
		// DB-backed API call (e.g. `OrganizationGuard`) surfaces the inconsistency, with a
		// confusing 403. The cost is one indexed point-lookup per request — same shape as
		// `OrganizationGuard`'s existing membership re-verification.
		async jwt({ token, user }) {
			if (user?.email) {
				const dbUser = await authPrisma.user.findUnique({
					where: { email: user.email },
					select: { id: true }
				});

				if (!dbUser) {
					return null;
				}

				token.userId = dbUser.id;
				return token;
			}

			if (token.userId) {
				const stillExists = await authPrisma.user.findUnique({
					where: { id: token.userId as string },
					select: { id: true }
				});

				if (!stillExists) {
					return null;
				}
			}

			return token;
		},
		// Copy JWT-side custom claims to the session payload exposed via /api/auth/session.
		async session({ session, token }) {
			if (token.userId) {
				session.user = {
					...session.user,
					id: token.userId as string
				};
			}

			return session;
		}
	},
	pages: {
		// Browser flows redirect to the web app; the web app calls back to /api/auth/*.
		signIn: '/sign-in',
		verifyRequest: '/verify-request',
		error: '/sign-in'
	}
};

declare module '@auth/core/types' {
	interface Session {
		user: {
			id: string;
			email?: string | null;
			name?: string | null;
			image?: string | null;
		};
	}
}

declare module '@auth/core/jwt' {
	interface JWT {
		userId?: string;
	}
}
