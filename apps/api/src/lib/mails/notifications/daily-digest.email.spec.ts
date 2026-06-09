import { describe, expect, it } from '@jest/globals';
import { buildDailyDigestEmail, type DailyDigestEmailInput } from './daily-digest.email';

const baseInput = (over: Partial<DailyDigestEmailInput> = {}): DailyDigestEmailInput => ({
	rankedItems: [{ customerName: 'Jansen', requestType: 'Badkamer', valueEuros: 1200, rankReason: 'Open aanvraag' }],
	expiringItems: [],
	totalOpenValueEuros: 1200,
	dashboardUrl: 'https://app.example.com/',
	...over
});

describe('buildDailyDigestEmail', () => {
	it('returns a non-empty subject and html', () => {
		const email = buildDailyDigestEmail(baseInput());
		expect(email.subject.length).toBeGreaterThan(0);
		expect(email.html.length).toBeGreaterThan(0);
	});

	it('renders a ranked item customerName + requestType in the html', () => {
		const email = buildDailyDigestEmail(baseInput());
		expect(email.html).toContain('Jansen');
		expect(email.html).toContain('Badkamer');
	});

	it('omits the "Verloopt binnenkort" block when there are no expiring items', () => {
		const email = buildDailyDigestEmail(baseInput({ expiringItems: [] }));
		expect(email.html).not.toContain('Verloopt binnenkort');
	});

	it('includes the "Verloopt binnenkort" block when there is an expiring item', () => {
		const email = buildDailyDigestEmail(
			baseInput({
				expiringItems: [
					{ customerName: 'De Vries', daysUntilExpiry: 2, opportunityUrl: 'https://app.example.com/o/1' }
				]
			})
		);
		expect(email.html).toContain('Verloopt binnenkort');
	});
});
