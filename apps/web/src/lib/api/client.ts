export const API_URL = `${import.meta.env.VITE_API_URL}`;

interface ApiError {
	code: number;
	message: string;
}

export class WrapperApiError extends Error {
	code: number;

	constructor(error: ApiError) {
		super(error.message);
		this.code = error.code;
		this.name = 'WrapperApiError';
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
		const errorBody = (await response.json()) as ApiError;

		throw new WrapperApiError({
			code: response.status,
			message: errorBody?.message ?? response.statusText ?? 'Unknown error'
		});
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
	if (response.type === 'opaqueredirect' || response.ok) {
		return;
	}

	throw new WrapperApiError({
		code: response.status,
		message: await response.text().catch(() => 'Unknown error')
	});
}
