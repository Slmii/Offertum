import { PATTERN_KEYS } from '@offertum/shared';
import type { PatternBanner, PatternKey } from '@offertum/shared';

import { ApiProperty } from '@nestjs/swagger';

export class PatternBannerResponseDto implements PatternBanner {
	@ApiProperty({ enum: PATTERN_KEYS })
	patternKey!: PatternKey;

	@ApiProperty()
	headline!: string;

	@ApiProperty()
	detail!: string;
}
