import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';

/**
 * HTTP Basic-Auth guard for the Swagger UI + raw OpenAPI JSON at `/docs` and
 * `/docs/openapi.json`. Returns a factory so the credentials can be wired from
 * `ConfigService` in `main.ts` rather than read from `process.env` here.
 *
 * Behavior:
 *  - Both `username` + `password` set → enforce basic auth, 401 + `WWW-Authenticate`
 *    challenge on every request without valid credentials.
 *  - Either credential unset → return `null` from the factory; caller should NOT
 *    mount the middleware and Swagger stays open. (In `production` the env
 *    schema requires both, so this branch only fires in dev.)
 *
 * Comparison uses `timingSafeEqual` over equal-length byte buffers so a wrong
 * password takes the same time as a right one — defends against the (small but
 * real) timing-attack surface basic auth otherwise exposes.
 */
export function buildDocsBasicAuthMiddleware(credentials: {
	username: string | undefined;
	password: string | undefined;
}): ((request: Request, response: Response, next: NextFunction) => void) | null {
	const { username, password } = credentials;
	if (!username || !password) {
		return null;
	}

	const expectedUser = Buffer.from(username);
	const expectedPass = Buffer.from(password);

	return function docsBasicAuthMiddleware(request: Request, response: Response, next: NextFunction): void {
		const header = request.headers.authorization;
		if (typeof header === 'string' && header.startsWith('Basic ')) {
			const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
			const separatorIndex = decoded.indexOf(':');
			if (separatorIndex !== -1) {
				const submittedUser = Buffer.from(decoded.slice(0, separatorIndex));
				const submittedPass = Buffer.from(decoded.slice(separatorIndex + 1));
				if (
					submittedUser.length === expectedUser.length &&
					submittedPass.length === expectedPass.length &&
					timingSafeEqual(submittedUser, expectedUser) &&
					timingSafeEqual(submittedPass, expectedPass)
				) {
					next();
					return;
				}
			}
		}

		response.setHeader('WWW-Authenticate', 'Basic realm="Quoteom API docs", charset="UTF-8"');
		response.status(401).type('text/plain').send('Authentication required.');
	};
}
