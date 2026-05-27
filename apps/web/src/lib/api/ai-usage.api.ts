import { serverFetch } from '@/lib/api/server-fetch';
import type { AIUsageRange, AIUsageResponse } from '@offertum/shared';
import { createServerFn } from '@tanstack/react-start';

export const getAIUsageServer = createServerFn({ method: 'GET' })
	.inputValidator((data: { range: AIUsageRange }) => data)
	.handler(async ({ data }): Promise<AIUsageResponse> => {
		const response = await serverFetch(`/api/admin/ai-usage?range=${encodeURIComponent(data.range)}`);
		if (!response.ok) {
			throw new Error(`Failed to load AI usage (${response.status})`);
		}
		return (await response.json()) as AIUsageResponse;
	});
