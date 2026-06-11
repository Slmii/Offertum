import { Module } from '@nestjs/common';

import { PatternsController } from './patterns.controller';
import { PatternsRepository } from './patterns.repository';
import { PatternsService } from './patterns.service';

@Module({
	controllers: [PatternsController],
	providers: [PatternsRepository, PatternsService],
	exports: [PatternsService]
})
export class PatternsModule {}
