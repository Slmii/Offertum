import { AdminEmailGuard } from '@/common/guards/admin-email.guard';
import { AuthGuard } from '@/common/guards/auth.guard';
import { AIUsageController } from '@/modules/ai-usage/ai-usage.controller';
import { AIUsageService } from '@/modules/ai-usage/ai-usage.service';
import { Module } from '@nestjs/common';

/**
 * Dev/admin endpoints around the `AICall` audit log. Today: token + cost dashboard.
 * Later: will likely grow per-org cost breakdowns the way the usage-tier billing model
 * will need them.
 */
@Module({
	controllers: [AIUsageController],
	providers: [AIUsageService, AdminEmailGuard, AuthGuard]
})
export class AIUsageModule {}
