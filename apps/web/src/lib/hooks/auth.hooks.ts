import { api, postForm } from '@/lib/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Session {
	user?: {
		id: string;
		email?: string | null;
		name?: string | null;
		image?: string | null;
		organizationId: string | null;
	};
	expires: string;
}

const AuthKeys = {
	session: ['auth', 'session'] as const,
	csrf: ['auth', 'csrf'] as const
};

export function useSession() {
	return useQuery({
		queryKey: AuthKeys.session,
		queryFn: async () => {
			const session = await api<Session>('/api/auth/session');
			// Auth.js returns `{}` when there's no session; normalize to null.
			return 'user' in session && session.user ? session : null;
		}
	});
}

async function getCsrfToken(): Promise<string> {
	const { csrfToken } = await api<{ csrfToken: string }>('/api/auth/csrf');
	return csrfToken;
}

export function useSignInWithEmail() {
	return useMutation({
		mutationFn: async (email: string) => {
			const csrfToken = await getCsrfToken();
			await postForm('/api/auth/signin/resend', { email, csrfToken });
		}
	});
}

export function useSignOut() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			const csrfToken = await getCsrfToken();
			await postForm('/api/auth/signout', { csrfToken });
		},
		onSuccess: () => {
			queryClient.setQueryData(AuthKeys.session, null);
		}
	});
}
