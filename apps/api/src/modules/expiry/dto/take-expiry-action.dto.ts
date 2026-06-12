import { EXPIRY_ACTION_KINDS } from '@offertum/shared';
import type { ExpiryActionKind } from '@/generated/prisma/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/** Request body for `POST /api/expiry-actions/:id/take` — which of the three actions to carry out. */
export class TakeExpiryActionDto {
	@ApiProperty({ enum: EXPIRY_ACTION_KINDS })
	@IsIn(EXPIRY_ACTION_KINDS)
	kind!: ExpiryActionKind;
}
