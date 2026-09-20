import { EmailProvider, NotificationEventType as PrismaNotificationEventType } from '@/generated/prisma/enums';
import { buildMailboxIssueEmail } from '@/lib/mails/notifications/mailbox-issue.email';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestEvents, InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { logContext as requestContext } from '@/modules/logger/log-context';
import { NotificationsRepository } from '@/modules/notifications/notifications.repository';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

interface MailboxIssuePayload {
	organizationId: string;
	userId: string | null;
	mailboxEmail: string;
	provider: EmailProvider;
}

/**
 * Delivers the critical "your mailbox stopped working" alert.
 *
 * This runs as an Inngest function rather than inline in `EmailAccountsService` for one
 * reason: the disconnect commits first, and the `disconnectedAt: null` guard means the
 * disconnect path can only ever fire this once. Inline, a single transient send failure
 * left the owner permanently unaware that their inbox had stopped syncing — which is the
 * one notification the product cannot afford to drop, because every other signal goes
 * quiet at the same moment. Inngest gives it retries.
 *
 * Recipients are the connecting user AND the org's OWNERs, not one or the other. The
 * owner of the business needs to know lead intake stopped even when a team member
 * connected that inbox; and when the connecting user has been deleted (`userId` nulled
 * via onDelete: SetNull) the OWNERs are the only recipients left.
 */
@Injectable()
export class MailboxIssueNotifyFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(notifications: NotificationsService, repository: NotificationsRepository) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.MailboxIssueNotify,
				name: 'Mailbox issue — notify owner',
				triggers: [{ event: InngestEvents.MailboxIssueDetected }],
				retries: 3
			},
			async ({ event, runId, step }) => {
				const data = event.data as unknown as MailboxIssuePayload;

				return step.run(InngestSteps.MailboxIssueNotify.Notify, async () =>
					// CLAUDE.md #8 — ALS context does not cross the step boundary.
					requestContext.run({ requestId: runId, organizationId: data.organizationId }, async () => {
						const ownerIds = await repository.findOrganizationOwnerIds(data.organizationId);
						const recipientIds = Array.from(new Set([...(data.userId ? [data.userId] : []), ...ownerIds]));
						if (recipientIds.length === 0) {
							return { recipients: 0 };
						}

						const providerLabel = data.provider === EmailProvider.GMAIL ? 'Gmail' : 'Microsoft';
						const email = buildMailboxIssueEmail({
							mailboxEmail: data.mailboxEmail,
							providerLabel,
							settingsUrl: `${notifications.webOrigin()}/settings/email`
						});

						const outcome = await notifications.notifyUsers({
							userIds: recipientIds,
							organizationId: data.organizationId,
							eventType: PrismaNotificationEventType.MAILBOX_ISSUE,
							title: 'Mailbox-probleem',
							body: `De koppeling met ${data.mailboxEmail} is verbroken. Koppel de mailbox opnieuw.`,
							link: '/settings/email',
							email
						});

						// Throw so Inngest retries. `notifyUsers` deliberately never throws — an
						// originating event must commit even if delivery fails — so without this
						// check a 503 from the mail provider would look like success and the three
						// retries configured above would never be used. This is the one alert that
						// must not be dropped: when the mailbox stops syncing, every other signal
						// goes quiet at the same moment.
						if (outcome.failedUserIds.length > 0) {
							throw new Error(
								`mailbox_issue delivery failed for ${outcome.failedUserIds.length} of ${recipientIds.length} recipient(s)`
							);
						}
						return { recipients: outcome.deliveredUserIds.length };
					})
				);
			}
		);
	}
}
