import { AdminEmailGuard } from '@/common/guards/admin-email.guard';
import { ClassifierQualityService } from '@/modules/classifier-quality/classifier-quality.service';
import { ClassifierQualityResponseDto } from '@/modules/classifier-quality/dto/classifier-quality.response.dto';
import { Controller, DefaultValuePipe, Get, ParseEnumPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

/** Wire-format enum kept in sync with `AIUsageRange` in `@offertum/shared`. */
enum ClassifierQualityRangeQuery {
	Today = 'today',
	Last7d = '7d',
	Last30d = '30d',
	All = 'all'
}

@ApiTags('admin')
@Controller('admin/classifier-quality')
@UseGuards(AdminEmailGuard)
export class ClassifierQualityController {
	constructor(private readonly quality: ClassifierQualityService) {}

	@ApiOperation({
		summary:
			'Admin classifier-quality dashboard data. Precision (1 − dismissed-as-NOT_A_QUOTE / total) sliced by (org, classifier model), top-5 recent false positives with classifiedAiCallId for deep-link, and bulk-mail filter recall proxy (filter-caught vs. user-dismissed-as-SPAM). Email-allowlist gated.'
	})
	@ApiOkResponse({ type: ClassifierQualityResponseDto })
	@Get()
	get(
		@Query(
			'range',
			new DefaultValuePipe(ClassifierQualityRangeQuery.Last7d),
			new ParseEnumPipe(ClassifierQualityRangeQuery)
		)
		range: ClassifierQualityRangeQuery
	): Promise<ClassifierQualityResponseDto> {
		return this.quality.aggregate(range);
	}
}
