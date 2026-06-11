import { OwnerWrite } from '@/common/decorators/owner-write.decorator';
import { OrganizationGuard } from '@/common/guards/organization.guard';
import { NOT_AUTHENTICATED } from '@/lib/errors';
import { ExpiryActionResponseDto } from '@/modules/expiry/dto/expiry-action.response.dto';
import { TakeExpiryActionDto } from '@/modules/expiry/dto/take-expiry-action.dto';
import type { ExpiryActionRecord } from '@/modules/expiry/expiry.repository';
import { ExpiryService } from '@/modules/expiry/expiry.service';
import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	Req,
	UnauthorizedException,
	UseGuards
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * Smart-expiry endpoints (W13). The global `api` prefix is applied in `main.ts`, so the
 * method-level paths here carry the full route. Reads are open to any org member; the
 * take/dismiss writes are owner-only (`@OwnerWrite`) and cross-tenant-scoped by passing
 * `request.organizationId!` into the service (which authorizes against the org).
 */
@ApiTags('expiry')
@Controller()
@UseGuards(OrganizationGuard)
export class ExpiryController {
	constructor(private readonly expiry: ExpiryService) {}

	@ApiOperation({ summary: 'The live expiry suggestion for an opportunity (or null)' })
	@ApiOkResponse({ type: ExpiryActionResponseDto })
	@Get('opportunities/:opportunityId/expiry-action')
	async getForOpportunity(
		@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
		@Req() request: Request
	): Promise<ExpiryActionResponseDto | null> {
		const row = await this.expiry.getForOpportunity(opportunityId, request.organizationId!);
		return row ? toExpiryActionResponseDto(row) : null;
	}

	@ApiOperation({ summary: 'Carry out one of the three expiry actions, then mark the suggestion TAKEN' })
	@OwnerWrite()
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post('expiry-actions/:id/take')
	async take(
		@Param('id', new ParseUUIDPipe()) id: string,
		@Body() body: TakeExpiryActionDto,
		@Req() request: Request
	): Promise<void> {
		await this.expiry.takeAction(id, request.organizationId!, requireUserId(request), body.kind);
	}

	@ApiOperation({ summary: 'Dismiss an expiry suggestion without acting on it' })
	@OwnerWrite()
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post('expiry-actions/:id/dismiss')
	async dismiss(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: Request): Promise<void> {
		await this.expiry.dismiss(id, request.organizationId!, requireUserId(request));
	}
}

/**
 * Project the full Prisma `ExpiryAction` row to the wire DTO. `validUntil` becomes an ISO
 * string; `takenAction` stays nullable (null until the suggestion is resolved via `take`).
 */
function toExpiryActionResponseDto(row: ExpiryActionRecord): ExpiryActionResponseDto {
	return {
		id: row.id,
		opportunityId: row.opportunityId,
		quoteDraftId: row.quoteDraftId,
		validUntil: row.validUntil.toISOString(),
		suggestedCopy: row.suggestedCopy,
		status: row.status,
		recommendedAction: row.recommendedAction,
		takenAction: row.takenAction
	};
}

/**
 * Pull the authenticated user's id off the Auth.js session attached by `AuthGuard` (which
 * `@OwnerWrite` composes in). The throw branch is defensive belt-and-braces.
 */
function requireUserId(request: Request): string {
	const userId = request.authSession?.user?.id;
	if (!userId) {
		throw new UnauthorizedException(NOT_AUTHENTICATED);
	}
	return userId;
}
