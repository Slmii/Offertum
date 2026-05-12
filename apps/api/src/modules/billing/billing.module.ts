import { AuthModule } from '@/modules/auth/auth.module';
import { BillingController } from '@/modules/billing/billing.controller';
import { BillingService } from '@/modules/billing/billing.service';
import { EntitlementGuard } from '@/common/guards/entitlement.guard';
import { Global, Module } from '@nestjs/common';

/**
 * Marked @Global so EntitlementGuard is resolvable by other modules' controllers via
 * `@UseGuards(EntitlementGuard)` or the `@TenantWrite()` / `@OwnerWrite()` composite
 * decorators without each module having to re-import BillingModule.
 */
@Global()
@Module({
	imports: [AuthModule],
	controllers: [BillingController],
	providers: [BillingService, EntitlementGuard],
	exports: [BillingService, EntitlementGuard]
})
export class BillingModule {}
