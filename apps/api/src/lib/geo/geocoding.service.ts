import type { LatLng } from '@/lib/geo/haversine';
import { Injectable, Logger } from '@nestjs/common';

/** PDOK Locatieserver — the Dutch government's official (BAG) address geocoder. Free, no API key,
 * NL-hosted (keeps address geocoding inside the EU). Solr-style response; `centroide_ll` is a WKT
 * `POINT(lng lat)` in WGS84. */
const PDOK_FREE_ENDPOINT = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';
const REQUEST_TIMEOUT_MS = 4000;

interface PdokResponse {
	response?: { docs?: Array<{ centroide_ll?: string }> };
}

/** Outcome of a PDOK lookup. `cacheable` distinguishes a real answer (a match, or a confirmed "no
 * address found") from a transient failure (timeout, network error, non-2xx) — only the former is
 * safe to remember for the lifetime of the process. */
interface PdokLookupResult {
	value: LatLng | null;
	cacheable: boolean;
}

/**
 * Geocodes a free-form (Dutch) address to lat/lng via PDOK. Best-effort: any failure — network,
 * timeout, non-200, no match, unparseable point — resolves to `null` (callers must treat a null as
 * "unknown location" and skip distance-based pricing, never fail the quote).
 *
 * Real answers (a match, or a confirmed "no address found") are cached in-process forever by
 * normalized address so the org's `companyAddress` is geocoded once per process rather than on
 * every quote. Transient failures (timeout, network error, non-2xx) are NEVER cached — a PDOK blip
 * must not permanently disable travel pricing for an address for the rest of the process's uptime.
 */
@Injectable()
export class GeocodingService {
	private readonly logger = new Logger(GeocodingService.name);
	private readonly cache = new Map<string, LatLng | null>();

	async geocode(address: string): Promise<LatLng | null> {
		const key = address.trim().toLowerCase();
		if (key.length === 0) {
			return null;
		}
		const cached = this.cache.get(key);
		if (cached !== undefined) {
			return cached;
		}

		const { value, cacheable } = await this.fetchFromPdok(address.trim());
		if (cacheable) {
			this.cache.set(key, value);
		}
		return value;
	}

	private async fetchFromPdok(address: string): Promise<PdokLookupResult> {
		const url = `${PDOK_FREE_ENDPOINT}?fl=centroide_ll&rows=1&q=${encodeURIComponent(address)}`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetch(url, { signal: controller.signal });
			if (!response.ok) {
				this.logger.warn(`PDOK geocode returned ${response.status} for "${address}"`);
				return { value: null, cacheable: false };
			}
			const body = (await response.json()) as PdokResponse;
			const point = body.response?.docs?.[0]?.centroide_ll;
			return { value: point ? parseWktPoint(point) : null, cacheable: true };
		} catch (error) {
			this.logger.warn(
				`PDOK geocode failed for "${address}": ${error instanceof Error ? error.message : 'unknown'}`
			);
			return { value: null, cacheable: false };
		} finally {
			clearTimeout(timeout);
		}
	}
}

/** Parse a WKT `POINT(lng lat)` string → `LatLng`. PDOK gives longitude first, latitude second. */
function parseWktPoint(wkt: string): LatLng | null {
	const match = /POINT\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/.exec(wkt);
	if (!match) {
		return null;
	}
	const lng = Number(match[1]);
	const lat = Number(match[2]);
	if (Number.isNaN(lat) || Number.isNaN(lng)) {
		return null;
	}
	return { lat, lng };
}
