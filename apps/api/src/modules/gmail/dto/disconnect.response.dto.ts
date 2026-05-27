import type { OkResponse } from '@offertum/shared';

export class GmailDisconnectResponseDto implements OkResponse {
	ok!: boolean;
}
