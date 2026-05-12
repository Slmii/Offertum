export class GmailMessageDto {
	id!: string;
	threadId!: string;
	/** Provider's `internalDate` rendered as ISO. */
	internalDate!: string;
	snippet!: string;
	subject!: string | null;
	from!: string | null;
}

export class GmailMessagesResponseDto {
	messages!: GmailMessageDto[];
}
