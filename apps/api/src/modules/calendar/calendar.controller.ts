// apps/api/src/modules/calendar/calendar.controller.ts
import { OrganizationGuard } from '@/common/guards/organization.guard';
import { CALENDAR_INVALID_DATE_RANGE, NOT_AUTHENTICATED } from '@/lib/errors';
import { CalendarService } from '@/modules/calendar/calendar.service';
import { CalendarEventDto } from '@/modules/calendar/dto/calendar-event.response.dto';
import { IcalFeedResponseDto } from '@/modules/calendar/dto/ical-feed.response.dto';
import {
	BadRequestException,
	Controller,
	DefaultValuePipe,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Post,
	Query,
	Req,
	UnauthorizedException,
	UseGuards
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CalendarEventScope } from '@offertum/shared';
import type { Request } from 'express';

@ApiTags('calendar')
@Controller('calendar')
@UseGuards(OrganizationGuard)
export class CalendarController {
	constructor(private readonly calendar: CalendarService) {}

	@ApiOperation({ summary: 'Calendar events for the active org within a date window' })
	@ApiOkResponse({ type: [CalendarEventDto] })
	@Get('events')
	getEvents(
		@Req() request: Request,
		@Query('from') from: string,
		@Query('to') to: string,
		@Query('scope', new DefaultValuePipe('all')) scope: CalendarEventScope
	): Promise<CalendarEventDto[]> {
		const fromDate = new Date(from);
		const toDate = new Date(to);
		if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
			throw new BadRequestException(CALENDAR_INVALID_DATE_RANGE);
		}
		return this.calendar.getEvents(request.organizationId!, {
			scope: scope === 'mine' ? 'mine' : 'all',
			requestingUserId: request.authSession?.user?.id ?? null,
			from: fromDate,
			to: toDate
		});
	}

	@ApiOperation({ summary: 'Current iCal feed URL for the requesting user (null when disabled)' })
	@ApiOkResponse({ type: IcalFeedResponseDto })
	@Get('ical/token')
	getFeedToken(@Req() request: Request): Promise<IcalFeedResponseDto> {
		return this.calendar.getFeedToken(this.userId(request));
	}

	@ApiOperation({ summary: 'Generate or rotate the iCal feed token (invalidates the old URL)' })
	@ApiOkResponse({ type: IcalFeedResponseDto })
	@Post('ical/token')
	generateFeedToken(@Req() request: Request): Promise<IcalFeedResponseDto> {
		return this.calendar.generateFeedToken(this.userId(request));
	}

	@ApiOperation({ summary: 'Revoke the iCal feed token (disables the feed)' })
	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete('ical/token')
	async revokeFeedToken(@Req() request: Request): Promise<void> {
		await this.calendar.revokeFeedToken(this.userId(request));
	}

	private userId(request: Request): string {
		const id = request.authSession?.user?.id;
		if (!id) {
			throw new UnauthorizedException(NOT_AUTHENTICATED);
		}
		return id;
	}
}
