import type { OrgVatConfig } from '@offertum/shared';

/**
 * Response for `GET /api/me/vat-settings` and `PATCH /api/me/vat-settings`. Concrete class (not
 * interface) so the OpenAPI spec carries the shape at runtime. Rates are numbers on the wire
 * (the DB stores Decimal).
 */
export class VatSettingsResponseDto implements OrgVatConfig {
	rates!: number[];
	defaultRate!: number;
	reverseChargeEnabled!: boolean;
	reverseChargeLabel!: string;
}
