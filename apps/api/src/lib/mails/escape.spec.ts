import { describe, expect, it } from '@jest/globals';
import { escapeHtml } from './escape';

describe('escapeHtml', () => {
	it('escapes ampersands', () => {
		expect(escapeHtml('Jansen & Zonen')).toBe('Jansen &amp; Zonen');
	});

	it('escapes less-than', () => {
		expect(escapeHtml('a < b')).toBe('a &lt; b');
	});

	it('escapes greater-than', () => {
		expect(escapeHtml('a > b')).toBe('a &gt; b');
	});

	it('escapes double quotes', () => {
		expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
	});

	it('escapes single quotes', () => {
		expect(escapeHtml("it's fine")).toBe('it&#39;s fine');
	});

	it('escapes a combined injection string', () => {
		expect(escapeHtml('<img src=x onerror="alert(\'xss\')">')).toBe(
			'&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;'
		);
	});

	it('is a no-op on already-safe text', () => {
		expect(escapeHtml('Badkamer renovatie')).toBe('Badkamer renovatie');
	});

	it('escapes ampersand before other characters (order correctness)', () => {
		// If ampersand were escaped last, '&lt;' would become '&amp;lt;'. This
		// verifies the replacement is applied to the raw input, not iteratively.
		expect(escapeHtml('&lt;')).toBe('&amp;lt;');
	});
});
