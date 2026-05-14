import { OrganizationGuard } from '@/common/guards/organization.guard';
import { NOT_AUTHENTICATED } from '@/lib/errors';
import { MembershipResponseDto } from '@/modules/me/dto/membership.response.dto';
import { SwitchOrganizationDto } from '@/modules/me/dto/switch-organization.dto';
import { MeService } from '@/modules/me/me.service';
import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('me')
@Controller('me')
@UseGuards(OrganizationGuard)
export class MeController {
	constructor(private readonly me: MeService) {}

	@ApiOperation({ summary: 'Memberships of the active organization' })
	@ApiOkResponse({ type: [MembershipResponseDto] })
	@Get('memberships')
	memberships(@Req() request: Request): Promise<MembershipResponseDto[]> {
		return this.me.listOrgMembers(request.organizationId!);
	}

	@ApiOperation({ summary: "Current user's membership in the active organization (role + user + org)" })
	@ApiOkResponse({ type: MembershipResponseDto })
	@Get('membership')
	async myMembership(@Req() request: Request): Promise<MembershipResponseDto> {
		return this.me.findMyMembership(this.userId(request), request.organizationId!);
	}

	@ApiOperation({ summary: 'All organizations the current user is a member of (for the org switcher)' })
	@ApiOkResponse({ type: [MembershipResponseDto] })
	@Get('organizations')
	myOrganizations(@Req() request: Request): Promise<MembershipResponseDto[]> {
		return this.me.listMyOrganizations(this.userId(request));
	}

	@ApiOperation({ summary: 'Switch the active organization for the current user' })
	@ApiOkResponse({ type: MembershipResponseDto })
	@Post('switch-organization')
	switchOrganization(@Req() request: Request, @Body() body: SwitchOrganizationDto): Promise<MembershipResponseDto> {
		return this.me.switchActiveOrganization(this.userId(request), body.organizationId);
	}

	/**
	 * `OrganizationGuard` guarantees `authSession.user.id` is set; the narrowing here is
	 * just to satisfy TypeScript. 401 is defensive — should never fire in practice. The
	 * old code threw 403 with the `MEMBERSHIP_NOT_FOUND` message, which was incorrect on
	 * both axes (different status code than `MeService.findMyMembership`'s 404 for the
	 * same logical "membership missing" string, and the real condition here is "no session
	 * user id", not "no membership").
	 */
	private userId(request: Request): string {
		const id = request.authSession?.user?.id;
		if (!id) {
			throw new UnauthorizedException(NOT_AUTHENTICATED);
		}
		return id;
	}
}
