import { AuthGuard } from '@/common/guards/auth.guard';
import { OrganizationGuard } from '@/common/guards/organization.guard';
import { OwnerGuard } from '@/common/guards/owner.guard';
import { SignupController } from '@/modules/auth/signup.controller';
import { SignupService } from '@/modules/auth/signup.service';
import { Module } from '@nestjs/common';

@Module({
	controllers: [SignupController],
	providers: [AuthGuard, OrganizationGuard, OwnerGuard, SignupService],
	exports: [AuthGuard, OrganizationGuard, OwnerGuard]
})
export class AuthModule {}
