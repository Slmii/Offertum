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
	@ApiProperty({ enum: ['SUGGESTED', 'TAKEN', 'DISMISSED', 'SUPERSEDED'] }) status!: ExpiryActionStatus;
	@ApiProperty({ enum: ['EXTEND_14D', 'LAST_FOLLOWUP', 'MARK_LOST'] }) recommendedAction!: ExpiryActionKind;
	@ApiProperty({ enum: ['EXTEND_14D', 'LAST_FOLLOWUP', 'MARK_LOST'], nullable: true })
	takenAction!: ExpiryActionKind | null;
}
