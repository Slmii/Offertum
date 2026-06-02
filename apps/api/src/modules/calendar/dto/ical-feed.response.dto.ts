// apps/api/src/modules/calendar/dto/ical-feed.response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import type { IcalFeed } from '@offertum/shared';

export class IcalFeedResponseDto implements IcalFeed {
	@ApiProperty({ type: String, nullable: true, description: 'Absolute feed URL, or null when disabled.' })
	url!: string | null;
}
