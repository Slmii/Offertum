import { VatRateOptionDto } from '@/modules/me/dto/update-vat-settings.dto';
import { ApiProperty } from '@nestjs/swagger';
import type { OrgVatConfig } from '@offertum/shared';

/**
 * Response for `GET /api/me/vat-settings` and `PATCH /api/me/vat-settings`. Concrete class (not
 * interface) so the OpenAPI spec carries the shape at runtime. `rates` reuses `VatRateOptionDto`
 * from the update DTO since the request/response shape is identical.
 */
export class VatSettingsResponseDto implements OrgVatConfig {
	@ApiProperty({ type: () => [VatRateOptionDto] })
	rates!: VatRateOptionDto[];

	reverseChargeEnabled!: boolean;
	reverseChargeLabel!: string;
}
