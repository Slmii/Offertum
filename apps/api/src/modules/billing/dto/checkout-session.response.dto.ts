import type { BillingSyncResponse, CheckoutSessionResponse } from '@offertum/shared';

export class CheckoutSessionResponseDto implements CheckoutSessionResponse {
	url!: string;
}

export class BillingSyncResponseDto implements BillingSyncResponse {
	ok!: boolean;
	status!: string | null;
}
