import { inngest } from '@/modules/inngest/inngest.client';
import { InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { MicrosoftSubscriptionService } from '@/modules/microsoft/microsoft-subscription.service';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

/**
 * Twice-daily cron — re-PATCHes any Microsoft Graph subscription whose 3-day TTL is
 * within 24 h of expiry. Wraps `MicrosoftSubscriptionService.renewExpiringSubscriptions()`.
 *
 * Cron `0 6,18 * * *` (06:00 + 18:00 UTC): tighter cadence than Gmail's daily renewal
 * because Graph's TTL is ~3 days (vs Gmail's 7), and we want at least one renewal attempt
 * BEFORE the 24 h-remaining buffer — the longer the gap between attempts, the more failed
 * renewals compound into orphaned subscriptions.
 *
 * If `MICROSOFT_GRAPH_NOTIFICATION_URL` isn't configured (typical dev),
 * `renewExpiringSubscriptions()` no-ops with a structured log instead of throwing.
 */
@Injectable()
export class MicrosoftSubscriptionRenewalFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(private readonly subscriptions: MicrosoftSubscriptionService) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.MicrosoftSubscriptionRenewal,
				name: 'Microsoft subscription renewal (twice daily)',
				triggers: [{ cron: '0 6,18 * * *' }],
				retries: 3
			},
			async ({ step }) => {
				const result = await step.run(InngestSteps.MicrosoftSubscriptionRenewal.Renew, () =>
					this.subscriptions.renewExpiringSubscriptions()
				);
				return result;
			}
		);
	}
}
