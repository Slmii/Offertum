import { inngest } from '@/modules/inngest/inngest.client';
import { InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { Logger } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

const logger = new Logger('InngestFn:heartbeat');

/**
 * Smoke function — cron-scheduled, fires automatically on its own schedule.
 *
 * Schedule is intentionally infrequent (1×/hour) — purely a "scheduled functions
 * arrive on time" smoke. Real cron jobs (follow-up sweep, watch renewal, etc.) land
 * with their own appropriate cadences.
 *
 * In the Inngest dev UI you can also fire it manually via "Invoke" → no need to wait
 * for the hourly tick during testing.
 */
export const heartbeatFn: InngestFunction.Any = inngest.createFunction(
	{
		id: InngestFunctionIds.Heartbeat,
		name: 'Heartbeat (scheduled smoke)',
		triggers: [{ cron: '0 * * * *' }] // Top of every hour, UTC
	},
	async ({ step }) => {
		const at = await step.run(InngestSteps.Heartbeat.RecordTick, () => new Date().toISOString());
		logger.log(`heartbeat tick at ${at}`);
		return { ok: true, at };
	}
);
