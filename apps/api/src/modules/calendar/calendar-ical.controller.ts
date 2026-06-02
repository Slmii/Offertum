// apps/api/src/modules/calendar/calendar-ical.controller.ts
import { CalendarService } from '@/modules/calendar/calendar.service';
import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';

/**
 * Public iCal subscription feed. No session — auth is the unguessable token in the path.
 * Excluded from Swagger/Orval because it returns a raw `text/calendar` body, not a typed
 * DTO. Calendar clients (Apple/Google) poll this URL; an unknown/revoked token 404s.
 *
 * The `:token` param arrives WITH the `.ics` suffix (e.g. `abc123.ics`); we strip it before
 * lookup so the subscribe URL ends in `.ics` (some clients require the extension).
 */
@ApiExcludeController()
@Controller('calendar/ical')
export class CalendarIcalController {
	constructor(private readonly calendar: CalendarService) {}

	@Get(':token')
	@Header('Content-Type', 'text/calendar; charset=utf-8')
	async feed(@Param('token') token: string, @Res({ passthrough: true }) response: Response): Promise<string> {
		const cleanToken = token.endsWith('.ics') ? token.slice(0, -'.ics'.length) : token;
		const body = await this.calendar.renderFeed(cleanToken);
		response.setHeader('Content-Disposition', 'inline; filename="offertum.ics"');
		return body;
	}
}
