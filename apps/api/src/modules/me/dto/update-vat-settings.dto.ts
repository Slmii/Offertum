import {
	VAT_RATE_MAX,
	VAT_RATE_MAX_DECIMALS,
	VAT_RATE_MIN,
	VAT_RATES_MAX_COUNT,
	VAT_REVERSE_CHARGE_LABEL_MAX_LENGTH,
	type OrgVatConfig
} from '@offertum/shared';
import {
	ArrayMaxSize,
	ArrayNotEmpty,
	IsArray,
	IsBoolean,
	IsNumber,
	IsString,
	Max,
	MaxLength,
	Min,
	MinLength
} from 'class-validator';

/**
 * Request body for `PATCH /api/me/vat-settings`. Bounds mirror the shared constants; the
 * cross-field rule (`defaultRate` ∈ `rates`) + de-duplication are enforced in the service.
 */
export class UpdateVatSettingsDto implements OrgVatConfig {
	@IsArray()
	@ArrayNotEmpty()
	@ArrayMaxSize(VAT_RATES_MAX_COUNT)
	@IsNumber({ maxDecimalPlaces: VAT_RATE_MAX_DECIMALS }, { each: true })
	@Min(VAT_RATE_MIN, { each: true })
	@Max(VAT_RATE_MAX, { each: true })
	rates!: number[];

	@IsNumber({ maxDecimalPlaces: VAT_RATE_MAX_DECIMALS })
	@Min(VAT_RATE_MIN)
	@Max(VAT_RATE_MAX)
	defaultRate!: number;

	@IsBoolean()
	reverseChargeEnabled!: boolean;

	@IsString()
	@MinLength(1)
	@MaxLength(VAT_REVERSE_CHARGE_LABEL_MAX_LENGTH)
	reverseChargeLabel!: string;
}
