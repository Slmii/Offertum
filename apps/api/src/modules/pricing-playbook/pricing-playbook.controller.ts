import { OrganizationGuard } from '@/common/guards/organization.guard';
import { TenantWrite } from '@/common/decorators/tenant-write.decorator';
import { PricingPlaybookResponseDto } from '@/modules/pricing-playbook/dto/pricing-playbook.response.dto';
import {
	PricingRuleResponseDto,
	PricingRulesListResponseDto
} from '@/modules/pricing-playbook/dto/pricing-rule.response.dto';
import { UpdatePricingPlaybookDto } from '@/modules/pricing-playbook/dto/update-pricing-playbook.dto';
import { UpdatePricingRuleDto } from '@/modules/pricing-playbook/dto/update-pricing-rule.dto';
import { PricingPlaybookService } from '@/modules/pricing-playbook/pricing-playbook.service';
import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Put,
	Req,
	UseGuards
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('pricing-playbook')
@Controller('pricing-playbook')
export class PricingPlaybookController {
	constructor(private readonly playbook: PricingPlaybookService) {}

	@ApiOperation({
		summary: 'Get the pricing playbook for the active organization (lazy-creates on first read)'
	})
	@ApiOkResponse({ type: PricingPlaybookResponseDto })
	@UseGuards(OrganizationGuard)
	@Get()
	get(@Req() request: Request): Promise<PricingPlaybookResponseDto> {
		return this.playbook.get(request.organizationId!);
	}

	@ApiOperation({ summary: 'Save the pricing playbook prose + enqueue a compile pass' })
	@ApiOkResponse({ type: PricingPlaybookResponseDto })
	@TenantWrite()
	@Put()
	update(@Req() request: Request, @Body() body: UpdatePricingPlaybookDto): Promise<PricingPlaybookResponseDto> {
		return this.playbook.update(request.organizationId!, body.playbookText);
	}

	@ApiOperation({ summary: 'List compiled + manual pricing rules for the active organization' })
	@ApiOkResponse({ type: PricingRulesListResponseDto })
	@UseGuards(OrganizationGuard)
	@Get('rules')
	listRules(@Req() request: Request): Promise<PricingRulesListResponseDto> {
		return this.playbook.listRules(request.organizationId!);
	}

	@ApiOperation({ summary: 'Patch a pricing rule. Flips manualOverride=true on success.' })
	@ApiOkResponse({ type: PricingRuleResponseDto })
	@TenantWrite()
	@Patch('rules/:id')
	updateRule(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string,
		@Body() body: UpdatePricingRuleDto
	): Promise<PricingRuleResponseDto> {
		return this.playbook.updateRule(request.organizationId!, id, body);
	}

	@ApiOperation({ summary: 'Delete a pricing rule' })
	@TenantWrite()
	@Delete('rules/:id')
	@HttpCode(HttpStatus.NO_CONTENT)
	async deleteRule(@Req() request: Request, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
		await this.playbook.deleteRule(request.organizationId!, id);
	}
}
