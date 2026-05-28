import { IsString, MinLength } from 'class-validator';

export class DeleteOrganizationDto {
	@IsString()
	@MinLength(1)
	confirm!: string;
}
