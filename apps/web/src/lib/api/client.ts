/**
 * Browser-only fetch wrapper for client-side HTTP to the API.
 *
 * Always uses relative URLs (the Vite dev proxy / prod reverse proxy forwards /api/*
 * to the NestJS API). Always credentialed. JSON-encodes object bodies.
 *
 * For server-side data fetching (SSR, loaders), use `createServerFn` handlers in
 * `src/server/*.server.ts` instead — they have access to the incoming Request and
 * can forward cookies, which a generic browser fetch cannot.
 */

interface ApiError {
	statusCode?: number;
	code?: string;
	// API may return either a single string or class-validator array of messages.
	message: string | string[];
	billingPath?: string;
}

export class WrapperApiError extends Error {
	code: number;
	apiCode?: string;
	billingPath?: string;

	constructor(error: { code: number; message: string; apiCode?: string; billingPath?: string }) {
		super(error.message);
		this.code = error.code;
		this.apiCode = error.apiCode;
		this.billingPath = error.billingPath;
		this.name = 'WrapperApiError';
	}
}

export const BILLING_REQUIRED_CODE = 'billing_required';

function flattenMessage(input: string | string[] | undefined, fallback: string): string {
	if (Array.isArray(input)) {
		return input.join('; ');
	}

	if (typeof input === 'string') {
		return input;
	}

	return fallback;
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
	body?: unknown;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
	const { body, headers, ...rest } = options;

	const response = await fetch(path, {
		credentials: 'include',
		headers: {
			...(body !== undefined && { 'Content-Type': 'application/json' }),
			...headers
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
		...rest
	});

	if (!response.ok) {
		const errorBody = (await response.json().catch(() => null)) as ApiError | null;

		// 402 with code=billing_required is the structured "no entitlement" signal from
		// the API's EntitlementGuard. We deliberately do NOT auto-redirect here — the
		// previous behaviour yanked the user out of the page they were on (settings,
		// detail view, mid-form, etc.), which felt like a bug. Instead the error
		// surfaces through React Query's MutationCache `onError` into a global banner
		// at the app-layout level (`BillingRequiredBanner`). The user keeps their
		// context + sees an explanatory CTA to the billing page.
		throw new WrapperApiError({
			code: response.status,
			message: flattenMessage(errorBody?.message, response.statusText || 'Unknown error'),
			apiCode: errorBody?.code,
			billingPath: errorBody?.billingPath
		});
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
}

/**
 * Like `api`, but for endpoints that stream a binary body (e.g. a rendered PDF).
 * JSON-encodes the request body, returns the response as a `Blob`. Error bodies are
 * still parsed as JSON so 402/4xx surface the same structured `WrapperApiError`.
 */
export async function apiBlob(path: string, options: ApiOptions = {}): Promise<Blob> {
	const { body, headers, ...rest } = options;

	const response = await fetch(path, {
		credentials: 'include',
		headers: {
			...(body !== undefined && { 'Content-Type': 'application/json' }),
			...headers
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
		...rest
	});

	if (!response.ok) {
		const errorBody = (await response.json().catch(() => null)) as ApiError | null;
		throw new WrapperApiError({
			code: response.status,
			message: flattenMessage(errorBody?.message, response.statusText || 'Unknown error'),
			apiCode: errorBody?.code,
			billingPath: errorBody?.billingPath
		});
	}

	return response.blob();
}

export async function apiForm<T>(
	path: string,
	formData: FormData,
	options: Omit<RequestInit, 'body'> = {}
): Promise<T> {
	const response = await fetch(path, {
		credentials: 'include',
		body: formData,
		...options
	});

	if (!response.ok) {
		const errorBody = (await response.json().catch(() => null)) as ApiError | null;
		throw new WrapperApiError({
			code: response.status,
			message: flattenMessage(errorBody?.message, response.statusText || 'Unknown error'),
			apiCode: errorBody?.code,
			billingPath: errorBody?.billingPath
		});
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
}

/**
 * Auth.js's signin/signout endpoints expect application/x-www-form-urlencoded with a CSRF
 * token, and respond with 302 redirects. Browser fetch with `redirect: 'manual'` returns
 * an `opaqueredirect` response on success.
 */
export async function postForm(path: string, fields: Record<string, string>): Promise<void> {
	const body = new URLSearchParams(fields);

	const response = await fetch(path, {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
		redirect: 'manual'
	});

	if (response.type === 'opaqueredirect' || response.ok) {
		return;
	}

	throw new WrapperApiError({
		code: response.status,
		message: await response.text().catch(() => 'Unknown error')
	});
}
