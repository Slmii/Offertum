import type { AcceptInvitationResponse } from '@offertum/shared';

export class AcceptInvitationResponseDto implements AcceptInvitationResponse {
	userId!: string;
	email!: string;
	organizationId!: string;
	organizationName!: string;
}
