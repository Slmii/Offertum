import { AiModule } from '@/modules/ai/ai.module';
import { OpportunitiesController } from '@/modules/opportunities/opportunities.controller';
import { OpportunitiesRepository } from '@/modules/opportunities/opportunities.repository';
import { OpportunitiesService } from '@/modules/opportunities/opportunities.service';
import { Module } from '@nestjs/common';

@Module({
	imports: [AiModule],
	controllers: [OpportunitiesController],
	providers: [OpportunitiesRepository, OpportunitiesService],
	exports: [OpportunitiesService]
})
export class OpportunitiesModule {}
