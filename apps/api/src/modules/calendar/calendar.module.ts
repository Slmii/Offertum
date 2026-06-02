// apps/api/src/modules/calendar/calendar.module.ts
import { CalendarIcalController } from '@/modules/calendar/calendar-ical.controller';
import { CalendarController } from '@/modules/calendar/calendar.controller';
import { CalendarRepository } from '@/modules/calendar/calendar.repository';
import { CalendarService } from '@/modules/calendar/calendar.service';
import { Module } from '@nestjs/common';

/**
 * W12 — Offerte calendar. Projects opportunity/quote/reply-draft dates into calendar events
 * (no persisted table) for an authenticated JSON read + a public token-auth iCal feed.
 */
@Module({
	controllers: [CalendarController, CalendarIcalController],
	providers: [CalendarService, CalendarRepository]
})
export class CalendarModule {}
