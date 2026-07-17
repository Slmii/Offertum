// apps/api/src/modules/calendar/dto/calendar-event.response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import type { CalendarEvent, CalendarEventType } from '@offertum/shared';

export class CalendarEventDto implements CalendarEvent {
	@ApiProperty()
	id!: string;

	@ApiProperty()
	opportunityId!: string;

	@ApiProperty({ enum: ['expiry', 'appointment', 'deadline', 'follow_up'] })
	type!: CalendarEventType;

	@ApiProperty()
	title!: string;

	@ApiProperty({ description: 'ISO timestamp' })
	at!: string;

	@ApiProperty()
	allDay!: boolean;
}
