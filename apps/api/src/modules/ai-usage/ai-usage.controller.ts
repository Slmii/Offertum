import { AdminEmailGuard } from '@/common/guards/admin-email.guard';
import { AIUsageService } from '@/modules/ai-usage/ai-usage.service';
import { AIUsageResponseDto } from '@/modules/ai-usage/dto/ai-usage.response.dto';
import { Controller, DefaultValuePipe, Get, ParseEnumPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

/** Wire-format enum kept in sync with `AIUsageRange` in `@offertum/shared`. */
enum AIUsageRangeQuery {
	Today = 'today',
	Last7d = '7d',
	Last30d = '30d',
	All = 'all'
}

@ApiTags('admin')
@Controller('admin/ai-usage')
@UseGuards(AdminEmailGuard)
export class AIUsageController {
	constructor(private readonly usage: AIUsageService) {}

	@ApiOperation({
		summary:
			'Dev/admin AI-usage dashboard data. Aggregated AICall rows grouped by (provider, model, purpose, organizationId, status). Email-allowlist gated.'
	})
	@ApiOkResponse({ type: AIUsageResponseDto })
	@Get()
	get(
		@Query('range', new DefaultValuePipe(AIUsageRangeQuery.Last7d), new ParseEnumPipe(AIUsageRangeQuery))
		range: AIUsageRangeQuery
	): Promise<AIUsageResponseDto> {
		return this.usage.aggregate(range);
	}
}
