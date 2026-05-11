import { AuthModule } from '@/modules/auth/auth.module';
import { BillingController } from '@/modules/billing/billing.controller';
import { BillingService } from '@/modules/billing/billing.service';
import { TrialGateGuard } from '@/modules/billing/trial-gate.guard';
import { Global, Module } from '@nestjs/common';

/**
 * Marked @Global so TrialGateGuard is resolvable by other modules' controllers via
 * `@UseGuards(TrialGateGuard)` or the `@TenantWrite()` composite decorator without
 * each module having to re-import BillingModule.
 */
@Global()
@Module({
	imports: [AuthModule],
	controllers: [BillingController],
	providers: [BillingService, TrialGateGuard],
	exports: [BillingService, TrialGateGuard]
})
export class BillingModule {}
