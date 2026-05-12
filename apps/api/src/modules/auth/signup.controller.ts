import { SignupDto } from '@/modules/auth/dto/signup.dto';
import { SignupResponseDto } from '@/modules/auth/dto/signup.response.dto';
import { SignupService } from '@/modules/auth/signup.service';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

/**
 * Public — no guards. Anyone with a valid, non-disposable email + company name can
 * create an account. Lives at `/api/signup` (not under `/api/auth/*` to avoid colliding
 * with Auth.js's Express middleware on that prefix).
 *
 * Rate-limited tighter than the global default (60/min) to 5 signups per IP per hour —
 * a legitimate human almost never signs up more than once or twice; sustained traffic
 * here is automation. 429 responses get a `Retry-After` header from `@nestjs/throttler`.
 */
@ApiTags('auth')
@Controller('signup')
export class SignupController {
	constructor(private readonly signup: SignupService) {}

	@ApiOperation({ summary: 'Create a new user + organization (self-signup)' })
	@ApiOkResponse({ type: SignupResponseDto })
	@Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
	@HttpCode(HttpStatus.OK)
	@Post()
	async create(@Body() body: SignupDto): Promise<SignupResponseDto> {
		const result = await this.signup.signup(body.email, body.companyName);
		return { ok: true, email: result.email };
	}
}
