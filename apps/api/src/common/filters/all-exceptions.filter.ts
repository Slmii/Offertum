import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

interface ErrorResponseBody {
	statusCode: number;
	message: string | string[];
	error?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
	private readonly logger = new Logger(AllExceptionsFilter.name);

	catch(exception: unknown, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse<Response>();

		const isHttp = exception instanceof HttpException;
		const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
		const rawBody = isHttp ? exception.getResponse() : null;

		const body: ErrorResponseBody = {
			statusCode: status,
			message: 'Internal server error'
		};

		if (typeof rawBody === 'string') {
			body.message = rawBody;
		} else if (rawBody && typeof rawBody === 'object') {
			const r = rawBody as Record<string, unknown>;
			if (typeof r.message === 'string' || Array.isArray(r.message)) {
				body.message = r.message as string | string[];
			}
			if (typeof r.error === 'string') {
				body.error = r.error;
			}
		}

		if (status >= 500) {
			this.logger.error(exception instanceof Error ? exception.stack : exception);
		}

		response.status(status).json(body);
	}
}
