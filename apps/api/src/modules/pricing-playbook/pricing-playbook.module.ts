import { AiModule } from '@/modules/ai/ai.module';
import { PricingPlaybookCompileService } from '@/modules/pricing-playbook/compile/compile.service';
import { PricingPlaybookController } from '@/modules/pricing-playbook/pricing-playbook.controller';
import { PricingPlaybookRepository } from '@/modules/pricing-playbook/pricing-playbook.repository';
import { PricingPlaybookService } from '@/modules/pricing-playbook/pricing-playbook.service';
import { Module } from '@nestjs/common';

@Module({
	imports: [AiModule],
	controllers: [PricingPlaybookController],
	providers: [PricingPlaybookService, PricingPlaybookRepository, PricingPlaybookCompileService],
	exports: [PricingPlaybookService, PricingPlaybookRepository, PricingPlaybookCompileService]
})
export class PricingPlaybookModule {}
