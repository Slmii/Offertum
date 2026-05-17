import { OrganizationGuard } from '@/common/guards/organization.guard';
import { TenantWrite } from '@/common/decorators/tenant-write.decorator';
import { ListOpportunitiesQueryDto } from '@/modules/opportunities/dto/list-opportunities-query.dto';
import { OpportunityListResponseDto } from '@/modules/opportunities/dto/opportunity-list.response.dto';
import { OpportunityResponseDto } from '@/modules/opportunities/dto/opportunity.response.dto';
import { UpdateOpportunityStatusDto } from '@/modules/opportunities/dto/update-opportunity-status.dto';
import { OpportunitiesService } from '@/modules/opportunities/opportunities.service';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('opportunities')
@Controller('opportunities')
export class OpportunitiesController {
	constructor(private readonly opportunities: OpportunitiesService) {}

	@ApiOperation({ summary: 'List opportunities for the active organization' })
	@ApiOkResponse({ type: OpportunityListResponseDto })
	@UseGuards(OrganizationGuard)
	@Get()
	list(@Req() request: Request, @Query() query: ListOpportunitiesQueryDto): Promise<OpportunityListResponseDto> {
		return this.opportunities.list(request.organizationId!, {
			cursor: query.cursor ?? null,
			limit: query.limit ?? null,
			status: query.status ?? null,
			search: query.search ?? null
		});
	}

	@ApiOperation({ summary: 'Update an opportunity status' })
	@ApiOkResponse({ type: OpportunityResponseDto })
	@TenantWrite()
	@Patch(':id/status')
	updateStatus(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string,
		@Body() body: UpdateOpportunityStatusDto
	): Promise<OpportunityResponseDto> {
		return this.opportunities.updateStatus(request.organizationId!, id, body.status);
	}
}
