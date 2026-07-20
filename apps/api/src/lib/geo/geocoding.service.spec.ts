import { GeocodingService } from '@/lib/geo/geocoding.service';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

/** Reassigns the global `fetch` (the service uses the platform fetch, not a module import — so this
 * is a straightforward global stub, no jest.mock hoisting needed). */
function stubFetch(impl: () => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>) {
	const mock = jest.fn(impl);
	global.fetch = mock as unknown as typeof fetch;
	return mock;
}

describe('GeocodingService', () => {
	const originalFetch = global.fetch;
	afterEach(() => {
		global.fetch = originalFetch;
		jest.restoreAllMocks();
	});

	it('parses a PDOK POINT(lng lat) into { lat, lng }', async () => {
		stubFetch(async () => ({
			ok: true,
			json: async () => ({ response: { docs: [{ centroide_ll: 'POINT(6.9061 52.7792)' }] } })
		}));

		const result = await new GeocodingService().geocode('Tammingecamp 22, Emmen');

		expect(result).toEqual({ lat: 52.7792, lng: 6.9061 });
	});

	it('caches by normalized address — a second lookup does not re-fetch', async () => {
		const mock = stubFetch(async () => ({
			ok: true,
			json: async () => ({ response: { docs: [{ centroide_ll: 'POINT(4.9 52.37)' }] } })
		}));

		const svc = new GeocodingService();
		await svc.geocode('Damrak 1, Amsterdam');
		await svc.geocode('  DAMRAK 1, AMSTERDAM  ');

		expect(mock).toHaveBeenCalledTimes(1);
	});

	it('returns null (fail-soft) on non-200, no matches, or a thrown fetch', async () => {
		const svc = new GeocodingService();

		stubFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }));
		expect(await svc.geocode('non-200')).toBeNull();

		stubFetch(async () => ({ ok: true, json: async () => ({ response: { docs: [] } }) }));
		expect(await svc.geocode('no-match')).toBeNull();

		global.fetch = jest.fn(async () => {
			throw new Error('network down');
		}) as unknown as typeof fetch;
		expect(await svc.geocode('throws')).toBeNull();
	});

	it('returns null for an empty address without fetching', async () => {
		const mock = stubFetch(async () => ({ ok: true, json: async () => ({}) }));
		expect(await new GeocodingService().geocode('   ')).toBeNull();
		expect(mock).not.toHaveBeenCalled();
	});
});
