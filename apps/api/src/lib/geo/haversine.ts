/** WGS84 latitude/longitude in decimal degrees. */
export interface LatLng {
	lat: number;
	lng: number;
}

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle (straight-line) distance between two points in kilometres — the raw geocoded distance
 * used directly for per-km travel pricing (no road-detour factor; keyless, no routing API).
 */
export function haversineKm(a: LatLng, b: LatLng): number {
	const dLat = toRadians(b.lat - a.lat);
	const dLng = toRadians(b.lng - a.lng);
	const lat1 = toRadians(a.lat);
	const lat2 = toRadians(b.lat);

	const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
