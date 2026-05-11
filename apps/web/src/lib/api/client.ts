export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly body: unknown,
		message?: string
	) {
		super(message ?? `API error ${status}`);
	}
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
	body?: unknown;
}

/** Fetch wrapper. Always credentialed; JSON-encodes the body if it's an object. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
	const { body, headers, ...rest } = options;

	const response = await fetch(`${API_URL}${path}`, {
		credentials: 'include',
		headers: {
			...(body !== undefined && { 'Content-Type': 'application/json' }),
			...headers
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
		...rest
	});

	if (!response.ok) {
		const errorBody = await response.json().catch(() => null);
		throw new ApiError(response.status, errorBody);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
}

/** Auth.js's signin/signout endpoints want application/x-www-form-urlencoded with a CSRF token. */
export async function postForm(path: string, fields: Record<string, string>): Promise<void> {
	const body = new URLSearchParams(fields);
	const response = await fetch(`${API_URL}${path}`, {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
		redirect: 'manual'
	});

	// `redirect: 'manual'` returns an opaque-redirect response on Auth.js's 302.
	if (response.type === 'opaqueredirect' || response.ok) return;
	throw new ApiError(response.status, await response.text().catch(() => null));
}
