import { haversineKm } from '@/lib/geo/haversine';
import { describe, expect, it } from '@jest/globals';

describe('haversineKm', () => {
	it('is 0 for identical points', () => {
		expect(haversineKm({ lat: 52.37, lng: 4.9 }, { lat: 52.37, lng: 4.9 })).toBe(0);
	});

	it('≈ 111.19 km for one degree of latitude', () => {
		expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
	});

	it('matches a known NL pair within tolerance (Amsterdam ↔ Utrecht ~35 km straight-line)', () => {
		const km = haversineKm({ lat: 52.3791, lng: 4.9003 }, { lat: 52.0894, lng: 5.1101 });
		expect(km).toBeGreaterThan(30);
		expect(km).toBeLessThan(40);
	});

	it('is symmetric', () => {
		const a = { lat: 52.7792, lng: 6.9061 };
		const b = { lat: 52.3791, lng: 4.9003 };
		expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
	});
});
