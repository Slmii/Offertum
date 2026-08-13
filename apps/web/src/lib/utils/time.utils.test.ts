import { describe, expect, it } from 'vitest';
import { formatTimeInput, normalizeTime } from './time.utils';

describe('formatTimeInput', () => {
	it('keeps a partial hour without forcing leading zeros', () => {
		expect(formatTimeInput('')).toBe('');
		expect(formatTimeInput('5')).toBe('5');
		expect(formatTimeInput('05')).toBe('05');
		expect(formatTimeInput('18')).toBe('18');
	});

	it('accepts a typed colon and keeps a single-digit hour', () => {
		expect(formatTimeInput('5:')).toBe('5:');
		expect(formatTimeInput('5:5')).toBe('5:5');
		expect(formatTimeInput('5:55')).toBe('5:55');
		expect(formatTimeInput('18:30')).toBe('18:30');
	});

	it('auto-inserts a colon after two digits when none is typed', () => {
		expect(formatTimeInput('073')).toBe('07:3');
		expect(formatTimeInput('0730')).toBe('07:30');
	});

	it('strips non-digit, non-colon characters and keeps only the first colon', () => {
		expect(formatTimeInput('a1b2')).toBe('12');
		expect(formatTimeInput('07::30')).toBe('07:30');
		expect(formatTimeInput('07:3:0')).toBe('07:30');
	});

	it('clamps the hour to 23 and the minute to 59', () => {
		expect(formatTimeInput('25')).toBe('23');
		expect(formatTimeInput('99')).toBe('23');
		expect(formatTimeInput('12:75')).toBe('12:59');
		expect(formatTimeInput('99:99')).toBe('23:59');
	});

	it('caps the length to two digits per part', () => {
		expect(formatTimeInput('12345')).toBe('12:34');
		expect(formatTimeInput('07:3045')).toBe('07:30');
	});

	it('supports deleting back through the colon', () => {
		expect(formatTimeInput('07:3')).toBe('07:3');
		expect(formatTimeInput('07:')).toBe('07:');
		expect(formatTimeInput('07')).toBe('07');
	});

	it('ignores a leading colon with no hour', () => {
		expect(formatTimeInput(':30')).toBe(':30');
	});
});

describe('normalizeTime', () => {
	it('pads the hour on the left and the minute on the right', () => {
		expect(normalizeTime('5:2')).toBe('05:20');
		expect(normalizeTime('6:45')).toBe('06:45');
	});

	it('fills a missing minute with zeros', () => {
		expect(normalizeTime('5')).toBe('05:00');
		expect(normalizeTime('18:')).toBe('18:00');
		expect(normalizeTime('07:3')).toBe('07:30');
	});

	it('leaves an already-valid time unchanged', () => {
		expect(normalizeTime('07:30')).toBe('07:30');
		expect(normalizeTime('23:59')).toBe('23:59');
		expect(normalizeTime('00:00')).toBe('00:00');
	});

	it('clamps out-of-range parts', () => {
		expect(normalizeTime('25:70')).toBe('23:59');
		expect(normalizeTime('99:99')).toBe('23:59');
	});

	it('treats a missing hour as midnight', () => {
		expect(normalizeTime(':30')).toBe('00:30');
	});

	it('leaves an empty field empty', () => {
		expect(normalizeTime('')).toBe('');
		expect(normalizeTime('   ')).toBe('   ');
	});
});
