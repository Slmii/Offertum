import { HelloResponseDto } from '@/common/dto/hello.response.dto';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
	getHello(): HelloResponseDto {
		return {
			message: 'Hello from Quoteom API',
			timestamp: new Date().toISOString()
		};
	}
}
