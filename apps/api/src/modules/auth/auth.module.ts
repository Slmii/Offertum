import { AuthGuard } from '@/common/guards/auth.guard';
import { OrganizationGuard } from '@/common/guards/organization.guard';
import { OwnerGuard } from '@/common/guards/owner.guard';
import { Module } from '@nestjs/common';

@Module({
	providers: [AuthGuard, OrganizationGuard, OwnerGuard],
	exports: [AuthGuard, OrganizationGuard, OwnerGuard]
})
export class AuthModule {}
