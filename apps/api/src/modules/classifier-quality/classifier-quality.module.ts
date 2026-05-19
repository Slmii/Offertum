import { AdminEmailGuard } from '@/common/guards/admin-email.guard';
import { ClassifierQualityController } from '@/modules/classifier-quality/classifier-quality.controller';
import { ClassifierQualityService } from '@/modules/classifier-quality/classifier-quality.service';
import { Module } from '@nestjs/common';

/**
 * Admin classifier-quality dashboard. Reads `Opportunity.dismissReason`
 * `AICall` + `Log` to compute classifier precision and
 * bulk-mail filter recall over a configurable time window.
 *
 * Sibling to `AIUsageModule`; same admin-email allowlist gate via `AdminEmailGuard`.
 */
@Module({
	controllers: [ClassifierQualityController],
	providers: [ClassifierQualityService, AdminEmailGuard]
})
export class ClassifierQualityModule {}
