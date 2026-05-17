import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Query params for `GET /api/opportunities`. `cursor` is an opaque base64url-encoded
 * string from a prior page's `nextCursor`. `limit` clamps server-side to [1, 100].
 */
export class ListOpportunitiesQueryDto {
	@IsOptional()
	@IsString()
	cursor?: string;

	@IsOptional()
	@Type(() => Number)
	@Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
	@IsInt()
	@Min(1)
	@Max(100)
	limit?: number;
}
