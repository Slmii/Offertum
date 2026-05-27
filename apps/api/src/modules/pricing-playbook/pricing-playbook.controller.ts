import { OwnerWrite } from '@/common/decorators/owner-write.decorator';
import { OwnerGuard } from '@/common/guards/owner.guard';
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

/**
 * **Owner-only at every endpoint.** Pricing rules drive every future quote in the
 * org — letting a regular MEMBER edit them would mean any team member could
 * silently change how the business charges customers. The FE route at
 * `/settings/pricing-playbook` already redirects non-OWNERs to `/settings/email`
 * before render; this controller enforces the same gate at the API boundary so
 * a direct curl can't bypass the UI check.
 */
@ApiTags('pricing-playbook')
@Controller('pricing-playbook')
export class PricingPlaybookController {
	constructor(private readonly playbook: PricingPlaybookService) {}

	@ApiOperation({
		summary: 'Get the pricing playbook for the active organization (lazy-creates on first read)'
	})
	@ApiOkResponse({ type: PricingPlaybookResponseDto })
	@UseGuards(OwnerGuard)
	@Get()
	get(@Req() request: Request): Promise<PricingPlaybookResponseDto> {
		return this.playbook.get(request.organizationId!);
	}

	@ApiOperation({ summary: 'Save the pricing playbook prose + enqueue a compile pass' })
	@ApiOkResponse({ type: PricingPlaybookResponseDto })
	@OwnerWrite()
	@Put()
	update(@Req() request: Request, @Body() body: UpdatePricingPlaybookDto): Promise<PricingPlaybookResponseDto> {
		return this.playbook.update(request.organizationId!, body.playbookText);
	}

	@ApiOperation({ summary: 'List compiled + manual pricing rules for the active organization' })
	@ApiOkResponse({ type: PricingRulesListResponseDto })
	@UseGuards(OwnerGuard)
	@Get('rules')
	listRules(@Req() request: Request): Promise<PricingRulesListResponseDto> {
		return this.playbook.listRules(request.organizationId!);
	}

	@ApiOperation({ summary: 'Patch a pricing rule. Flips manualOverride=true on success.' })
	@ApiOkResponse({ type: PricingRuleResponseDto })
	@OwnerWrite()
	@Patch('rules/:id')
	updateRule(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string,
		@Body() body: UpdatePricingRuleDto
	): Promise<PricingRuleResponseDto> {
		return this.playbook.updateRule(request.organizationId!, id, body);
	}

	@ApiOperation({ summary: 'Delete a pricing rule' })
	@OwnerWrite()
	@Delete('rules/:id')
	@HttpCode(HttpStatus.NO_CONTENT)
	async deleteRule(@Req() request: Request, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
		await this.playbook.deleteRule(request.organizationId!, id);
	}
}
