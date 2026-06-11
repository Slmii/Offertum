import { ExpiryModule } from '@/modules/expiry/expiry.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { Module } from '@nestjs/common';
import { DigestRepository } from './digest.repository';
import { DigestService } from './digest.service';

@Module({
	imports: [NotificationsModule, ExpiryModule],
	providers: [DigestRepository, DigestService],
	exports: [DigestService]
})
export class DigestModule {}
