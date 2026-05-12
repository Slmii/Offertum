import { getGmailMessagesServer, getGmailStatusServer } from '@/lib/api/email.api';
import { api } from '@/lib/api/client';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
export type { GmailMessage, GmailMessages, GmailStatus } from '@/lib/api/email.api';

export const EmailKeys = {
	gmailStatus: ['email', 'gmail', 'status'] as const,
	gmailMessages: ['email', 'gmail', 'messages'] as const
};

export const gmailStatusQueryOptions = queryOptions({
	queryKey: EmailKeys.gmailStatus,
	queryFn: getGmailStatusServer,
	staleTime: 30_000
});

export const gmailMessagesQueryOptions = queryOptions({
	queryKey: EmailKeys.gmailMessages,
	queryFn: getGmailMessagesServer,
	staleTime: 60_000
});

/**
 * Disconnect Gmail. Both queries are invalidated since the disconnect changes both
 * the connection status AND the messages list (the latter will 404 → empty).
 */
export function useDisconnectGmail() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api<{ ok: boolean }>('/api/email/gmail/disconnect', { method: 'POST' }),
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: EmailKeys.gmailStatus });
			void queryClient.invalidateQueries({ queryKey: EmailKeys.gmailMessages });
		}
	});
}
