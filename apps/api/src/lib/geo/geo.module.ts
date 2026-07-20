import { GeocodingService } from '@/lib/geo/geocoding.service';
import { Module } from '@nestjs/common';

/** Provides address geocoding (PDOK) — consumed by the quote pricing pipeline for per-km travel. */
@Module({
	providers: [GeocodingService],
	exports: [GeocodingService]
})
export class GeoModule {}
