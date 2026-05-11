import { getRequestHeader } from '@tanstack/react-start/server';

const API_URL = import.meta.env.VITE_API_URL;

/**
 * Server-side fetch wrapper for `createServerFn` handlers. Forwards the inbound request's
 * cookie header to the NestJS API so the session is preserved across the SSR boundary.
 *
 * Use ONLY inside `createServerFn(...).handler(...)` — it depends on TanStack Start's
 * per-request `getRequestHeader` context, which only exists during a server handler call.
 */
export async function serverFetch(path: string, init: RequestInit = {}): Promise<Response> {
	const cookie = getRequestHeader('cookie');
	return fetch(`${API_URL}${path}`, {
		...init,
		headers: {
			...init.headers,
			...(cookie ? { cookie } : {})
		}
	});
}
