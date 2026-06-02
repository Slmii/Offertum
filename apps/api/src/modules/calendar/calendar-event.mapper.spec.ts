// apps/api/src/modules/calendar/calendar-event.mapper.spec.ts
import { describe, expect, it } from '@jest/globals';
import { toCalendarEvents, type CalendarEventSource, type OrgCalendarConfig } from './calendar-event.mapper';

const CFG: OrgCalendarConfig = { quoteValidityDays: 30, followUpCadenceDays: 4, followUpMaxCount: 2 };

function baseSource(overrides: Partial<CalendarEventSource> = {}): CalendarEventSource {
	return {
		opportunityId: 'opp-1',
		status: 'NEW',
		dismissedAt: null,
		customerName: 'Jansen',
		customerDeadline: null,
		customerAppointment: null,
		currentQuoteDraft: null,
		latestSentQuoteDraft: null,
		latestSentReplyDraftAt: null,
		priorCheckInCount: 0,
		...overrides
	};
}

describe('toCalendarEvents', () => {
	it('returns no events for a dismissed opportunity', () => {
		const events = toCalendarEvents(
			baseSource({ dismissedAt: new Date('2026-06-01'), customerAppointment: new Date('2026-06-10') }),
			CFG
		);
		expect(events).toEqual([]);
	});

	it('emits an appointment event (timed) with a stable id', () => {
		const events = toCalendarEvents(baseSource({ customerAppointment: new Date('2026-06-10T09:30:00.000Z') }), CFG);
		expect(events).toEqual([
			{
				id: 'opp-1:appointment',
				opportunityId: 'opp-1',
				type: 'appointment',
				title: 'Afspraak — Jansen',
				at: '2026-06-10T09:30:00.000Z',
				allDay: false
			}
		]);
	});

	it('emits a deadline event (all-day)', () => {
		const events = toCalendarEvents(baseSource({ customerDeadline: new Date('2026-06-15T00:00:00.000Z') }), CFG);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ type: 'deadline', allDay: true, title: 'Deadline klant — Jansen' });
	});

	it('emits sent (from the latest sent draft, timed) + expiry (date-only, from validUntil)', () => {
		const events = toCalendarEvents(
			baseSource({
				currentQuoteDraft: {
					id: 'qd-1',
					createdAt: new Date('2026-06-01T08:00:00.000Z'),
					validUntil: new Date('2026-06-12T00:00:00.000Z') // stored validity → anchors expiry
				},
				latestSentQuoteDraft: { id: 'qd-1', sentAt: new Date('2026-06-05T09:00:00.000Z') }
			}),
			CFG
		);
		const byType = Object.fromEntries(events.map(e => [e.type, e]));
		// `sent` is a timed event (full ISO); `expiry` is all-day (Amsterdam date-only string).
		expect(byType.sent).toMatchObject({ id: 'qd-1:sent', at: '2026-06-05T09:00:00.000Z', allDay: false });
		expect(byType.expiry).toMatchObject({ id: 'qd-1:expiry', at: '2026-06-12', allDay: true });
	});

	it('emits an expiry event for an UNSENT current quote draft (no sent marker)', () => {
		const events = toCalendarEvents(
			baseSource({
				currentQuoteDraft: {
					id: 'qd-2',
					createdAt: new Date('2026-06-01T08:00:00.000Z'),
					validUntil: new Date('2026-06-12T00:00:00.000Z')
				},
				latestSentQuoteDraft: null
			}),
			CFG
		);
		expect(events.some(e => e.type === 'sent')).toBe(false);
		expect(events.find(e => e.type === 'expiry')).toMatchObject({ id: 'qd-2:expiry', at: '2026-06-12' });
	});

	it('keeps the sent marker from an older sent draft when the current draft is an unsent reprice', () => {
		const events = toCalendarEvents(
			baseSource({
				currentQuoteDraft: {
					id: 'qd-new',
					createdAt: new Date('2026-06-10T08:00:00.000Z'),
					validUntil: new Date('2026-07-10T00:00:00.000Z')
				},
				latestSentQuoteDraft: { id: 'qd-old', sentAt: new Date('2026-06-02T09:00:00.000Z') }
			}),
			CFG
		);
		// sent marker survives on the older sent draft; expiry tracks the current (repriced) draft.
		expect(events.find(e => e.type === 'sent')).toMatchObject({ id: 'qd-old:sent' });
		expect(events.find(e => e.type === 'expiry')).toMatchObject({ id: 'qd-new:expiry', at: '2026-07-10' });
	});

	it('falls back to createdAt + quoteValidityDays when validUntil is null (legacy draft)', () => {
		const events = toCalendarEvents(
			baseSource({
				currentQuoteDraft: { id: 'qd-3', createdAt: new Date('2026-06-01T08:00:00.000Z'), validUntil: null },
				latestSentQuoteDraft: null
			}),
			CFG // quoteValidityDays: 30
		);
		expect(events.find(e => e.type === 'expiry')).toMatchObject({ id: 'qd-3:expiry', at: '2026-07-01' });
	});

	it('suppresses sent + expiry on terminal (WON/LOST) opportunities', () => {
		for (const status of ['WON', 'LOST'] as const) {
			const events = toCalendarEvents(
				baseSource({
					status,
					currentQuoteDraft: {
						id: 'qd-x',
						createdAt: new Date('2026-06-01T08:00:00.000Z'),
						validUntil: new Date('2026-06-12T00:00:00.000Z')
					},
					latestSentQuoteDraft: { id: 'qd-x', sentAt: new Date('2026-06-05T09:00:00.000Z') }
				}),
				CFG
			);
			expect(events.some(e => e.type === 'sent' || e.type === 'expiry')).toBe(false);
		}
	});

	it('emits a follow_up event when REPLIED, under cap, with a sent reply draft', () => {
		const events = toCalendarEvents(
			baseSource({
				status: 'REPLIED',
				latestSentReplyDraftAt: new Date('2026-06-01T08:00:00.000Z'),
				priorCheckInCount: 1
			}),
			CFG
		);
		const followUp = events.find(e => e.type === 'follow_up');
		expect(followUp).toMatchObject({ id: 'opp-1:follow_up', at: '2026-06-05', allDay: true });
	});

	it('suppresses follow_up when the check-in cap is reached', () => {
		const events = toCalendarEvents(
			baseSource({
				status: 'REPLIED',
				latestSentReplyDraftAt: new Date('2026-06-01T08:00:00.000Z'),
				priorCheckInCount: 2
			}),
			CFG
		);
		expect(events.some(e => e.type === 'follow_up')).toBe(false);
	});

	it('suppresses follow_up when not REPLIED', () => {
		const events = toCalendarEvents(
			baseSource({ status: 'NEW', latestSentReplyDraftAt: new Date('2026-06-01T08:00:00.000Z') }),
			CFG
		);
		expect(events.some(e => e.type === 'follow_up')).toBe(false);
	});

	it('falls back to "Aanvraag" when customerName is null', () => {
		const events = toCalendarEvents(
			baseSource({ customerName: null, customerDeadline: new Date('2026-06-15') }),
			CFG
		);
		expect(events[0]?.title).toBe('Deadline klant — Aanvraag');
	});
});
