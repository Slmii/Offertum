import type { ExpiryActionKind } from '@/generated/prisma/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/** Request body for `POST /api/expiry-actions/:id/take` — which of the three actions to carry out. */
export class TakeExpiryActionDto {
	@ApiProperty({ enum: ['EXTEND_14D', 'LAST_FOLLOWUP', 'MARK_LOST'] })
	@IsIn(['EXTEND_14D', 'LAST_FOLLOWUP', 'MARK_LOST'])
	kind!: ExpiryActionKind;
}
