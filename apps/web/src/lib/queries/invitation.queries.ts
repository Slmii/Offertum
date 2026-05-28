import { api } from '@/lib/api/client';
import type { AcceptInvitationResponse } from '@offertum/shared';
import { useMutation } from '@tanstack/react-query';

export const useAcceptInvitation = () => {
	// No invalidation needed — caller redirects the user into the org on success;
	// the full page navigation resets the query cache naturally.
	return useMutation({
		mutationFn: async (token: string) =>
			api<AcceptInvitationResponse>('/api/invitations/accept', {
				method: 'POST',
				body: { token }
			})
	});
};
