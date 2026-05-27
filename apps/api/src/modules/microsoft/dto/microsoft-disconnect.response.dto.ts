import type { OkResponse } from '@offertum/shared';

export class MicrosoftDisconnectResponseDto implements OkResponse {
	ok!: boolean;
}
