import { getGmailStatusServer, getMicrosoftStatusServer } from '@/lib/api/email.api';
import { api } from '@/lib/api/client';
import type { OkResponse } from '@offertum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

export const EmailKeys = {
	gmailStatus: ['email', 'gmail', 'status'] as const,
	microsoftStatus: ['email', 'microsoft', 'status'] as const
};

export const gmailStatusQueryOptions = queryOptions({
	queryKey: EmailKeys.gmailStatus,
	queryFn: getGmailStatusServer,
	staleTime: 30_000
});

export const microsoftStatusQueryOptions = queryOptions({
	queryKey: EmailKeys.microsoftStatus,
	queryFn: getMicrosoftStatusServer,
	staleTime: 30_000
});

export function useDisconnectGmail() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api<OkResponse>('/api/email/gmail/disconnect', { method: 'POST' }),
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: EmailKeys.gmailStatus });
		}
	});
}

export function useDisconnectMicrosoft() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api<OkResponse>('/api/email/microsoft/disconnect', { method: 'POST' }),
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: EmailKeys.microsoftStatus });
		}
	});
}
