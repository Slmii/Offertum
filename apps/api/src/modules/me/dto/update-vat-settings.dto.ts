import {
	VAT_RATE_KINDS,
	VAT_RATE_LABEL_MAX_LENGTH,
	VAT_RATE_MAX,
	VAT_RATE_MIN,
	VAT_RATES_MAX_COUNT,
	VAT_REVERSE_CHARGE_LABEL_MAX_LENGTH,
	type OrgVatConfig,
	type VatRateKind,
	type VatRateOption
} from '@offertum/shared';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayNotEmpty,
	IsArray,
	IsBoolean,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsString,
	Max,
	MaxLength,
	Min,
	MinLength,
	ValidateIf,
	ValidateNested
} from 'class-validator';

/**
 * A single VAT rate option in the request body of `PATCH /api/me/vat-settings`. Mirrors
 * `VatRateOption` from `@offertum/shared`.
 */
export class VatRateOptionDto implements VatRateOption {
	@IsString()
	@IsNotEmpty()
	id!: string;

	@IsString()
	@MinLength(1)
	@MaxLength(VAT_RATE_LABEL_MAX_LENGTH)
	label!: string;

	@ApiProperty({ enum: VAT_RATE_KINDS })
	@IsIn(VAT_RATE_KINDS as string[])
	kind!: VatRateKind;

	@IsInt()
	@Min(VAT_RATE_MIN)
	@Max(VAT_RATE_MAX)
	rate!: number;

	@IsBoolean()
	isDefault!: boolean;

	@IsBoolean()
	active!: boolean;
}

/**
 * Request body for `PATCH /api/me/vat-settings`. The cross-field rule (at least one active rate)
 * + default-rate normalisation (`vatEnsureDefault`) are enforced in the service.
 */
export class UpdateVatSettingsDto implements OrgVatConfig {
	@IsArray()
	@ArrayNotEmpty()
	@ArrayMaxSize(VAT_RATES_MAX_COUNT)
	@ValidateNested({ each: true })
	@Type(() => VatRateOptionDto)
	rates!: VatRateOptionDto[];

	@IsBoolean()
	reverseChargeEnabled!: boolean;

	@IsString()
	@ValidateIf(o => o.reverseChargeEnabled)
	@MinLength(1)
	@MaxLength(VAT_REVERSE_CHARGE_LABEL_MAX_LENGTH)
	reverseChargeLabel!: string;
}
