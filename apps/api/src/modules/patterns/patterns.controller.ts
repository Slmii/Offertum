import { OrganizationGuard } from '@/common/guards/organization.guard';
import { TenantWrite } from '@/common/decorators/tenant-write.decorator';
import { NOT_AUTHENTICATED, UNKNOWN_PATTERN_KEY } from '@/lib/errors';
import { PatternBannerResponseDto } from '@/modules/patterns/dto/pattern-banner.response.dto';
import { PatternsService } from '@/modules/patterns/patterns.service';
import { PATTERN_KEYS } from '@offertum/shared';
import type { PatternKey } from '@offertum/shared';
import {
	BadRequestException,
	Controller,
	Get,
	HttpCode,
	Param,
	Post,
	Req,
	UnauthorizedException,
	UseGuards
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('patterns')
@Controller('patterns')
@UseGuards(OrganizationGuard)
export class PatternsController {
	constructor(private readonly patterns: PatternsService) {}

	@ApiOkResponse({ type: [PatternBannerResponseDto] })
	@Get()
	async getPatterns(@Req() request: Request): Promise<PatternBannerResponseDto[]> {
		return this.patterns.getPatterns(request.organizationId!, this.userId(request));
	}

	@TenantWrite()
	@HttpCode(204)
	@Post(':key/dismiss')
	async dismiss(@Param('key') key: string, @Req() request: Request): Promise<void> {
		if (!(PATTERN_KEYS as readonly string[]).includes(key)) {
			throw new BadRequestException(UNKNOWN_PATTERN_KEY);
		}
		await this.patterns.dismiss(request.organizationId!, this.userId(request), key as PatternKey);
	}

	/**
	 * `OrganizationGuard` guarantees `authSession.user.id` is set; the narrowing here is
	 * just to satisfy TypeScript. 401 is defensive — should never fire in practice.
	 */
	private userId(request: Request): string {
		const id = request.authSession?.user?.id;
		if (!id) {
			throw new UnauthorizedException(NOT_AUTHENTICATED);
		}
		return id;
	}
}
