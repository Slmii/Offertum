// apps/api/src/modules/calendar/calendar-ical.controller.spec.ts
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { CalendarIcalController } from './calendar-ical.controller';
import type { CalendarService } from './calendar.service';

function makeResponse(): Response {
	return { setHeader: jest.fn() } as unknown as Response;
}

describe('CalendarIcalController.feed', () => {
	let renderFeed: jest.MockedFunction<CalendarService['renderFeed']>;
	let controller: CalendarIcalController;

	beforeEach(() => {
		renderFeed = jest.fn<CalendarService['renderFeed']>();
		controller = new CalendarIcalController({ renderFeed } as unknown as CalendarService);
	});

	it('strips the .ics suffix before lookup and returns the body', async () => {
		renderFeed.mockResolvedValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
		const body = await controller.feed('abc123.ics', makeResponse());
		expect(renderFeed).toHaveBeenCalledWith('abc123');
		expect(body).toContain('BEGIN:VCALENDAR');
	});

	it('propagates NotFound for an unknown token', async () => {
		renderFeed.mockRejectedValue(new NotFoundException());
		await expect(controller.feed('nope.ics', makeResponse())).rejects.toBeInstanceOf(NotFoundException);
	});
});
