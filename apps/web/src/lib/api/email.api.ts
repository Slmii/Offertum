import { serverFetch } from '@/lib/api/server-fetch';
import type { MailboxStatus } from '@offertum/shared';
import { createServerFn } from '@tanstack/react-start';

export const getGmailStatusServer = createServerFn({ method: 'GET' }).handler(async (): Promise<MailboxStatus> => {
	const response = await serverFetch('/api/email/gmail/status');
	if (!response.ok) {
		throw new Error(`Failed to load Gmail status (${response.status})`);
	}
	return (await response.json()) as MailboxStatus;
});

export const getMicrosoftStatusServer = createServerFn({ method: 'GET' }).handler(async (): Promise<MailboxStatus> => {
	const response = await serverFetch('/api/email/microsoft/status');
	if (!response.ok) {
		throw new Error(`Failed to load Microsoft status (${response.status})`);
	}
	return (await response.json()) as MailboxStatus;
});
