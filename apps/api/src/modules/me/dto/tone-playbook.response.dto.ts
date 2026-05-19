import type { TonePlaybook } from '@quoteom/shared';

/**
 * Response for `GET /api/me/tone-playbook` and `PUT /api/me/tone-playbook`. Concrete
 * class (not interface) so the OpenAPI spec carries the shape at runtime — required for
 * Orval-generated web types per the D18 convention.
 */
export class TonePlaybookResponseDto implements TonePlaybook {
	text!: string | null;
	updatedAt!: string | null;
}
