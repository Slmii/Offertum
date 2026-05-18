import { AdminEmailGuard } from '@/common/guards/admin-email.guard';
import { ClassifierQualityController } from '@/modules/classifier-quality/classifier-quality.controller';
import { ClassifierQualityService } from '@/modules/classifier-quality/classifier-quality.service';
import { Module } from '@nestjs/common';

/**
 * W4.6.5 — Admin classifier-quality dashboard. Reads `Opportunity.dismissReason`
 * (W4.6) + `AICall` (W4.1) + `Log` (W2.6 / S9) to compute classifier precision and
 * bulk-mail filter recall over a configurable time window.
 *
 * Sibling to `AIUsageModule`; same admin-email allowlist gate via `AdminEmailGuard`.
 */
@Module({
	controllers: [ClassifierQualityController],
	providers: [ClassifierQualityService, AdminEmailGuard]
})
export class ClassifierQualityModule {}
