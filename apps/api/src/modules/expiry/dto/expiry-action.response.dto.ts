import { EXPIRY_ACTION_KINDS, EXPIRY_ACTION_STATUSES } from '@offertum/shared';
import type { ExpiryActionKind, ExpiryActionStatus } from '@/generated/prisma/enums';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Wire-format projection of an `ExpiryAction` row. `validUntil` is an ISO string on the
 * wire (the service deals in `Date`). Enum fields are surfaced as their string literals so
 * Orval emits a union type rather than `string`.
 */
export class ExpiryActionResponseDto {
	@ApiProperty() id!: string;
	@ApiProperty() opportunityId!: string;
	@ApiProperty() quoteDraftId!: string;
	@ApiProperty() validUntil!: string;
	@ApiProperty() suggestedCopy!: string;
	@ApiProperty({ enum: EXPIRY_ACTION_STATUSES }) status!: ExpiryActionStatus;
	@ApiProperty({ enum: EXPIRY_ACTION_KINDS }) recommendedAction!: ExpiryActionKind;
	@ApiProperty({ enum: EXPIRY_ACTION_KINDS, nullable: true })
	takenAction!: ExpiryActionKind | null;
}
