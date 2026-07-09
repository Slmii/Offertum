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

	it('emits an expiry event (date-only, from validUntil) for the current quote draft', () => {
		const events = toCalendarEvents(
			baseSource({
				currentQuoteDraft: {
					id: 'qd-1',
					createdAt: new Date('2026-06-01T08:00:00.000Z'),
					validUntil: new Date('2026-06-12T00:00:00.000Z') // stored validity → anchors expiry
				}
			}),
			CFG
		);
		// `expiry` is all-day (Amsterdam date-only string).
		expect(events.find(e => e.type === 'expiry')).toMatchObject({
			id: 'qd-1:expiry',
			at: '2026-06-12',
			allDay: true
		});
	});

	it('falls back to createdAt + quoteValidityDays when validUntil is null (legacy draft)', () => {
		const events = toCalendarEvents(
			baseSource({
				currentQuoteDraft: { id: 'qd-3', createdAt: new Date('2026-06-01T08:00:00.000Z'), validUntil: null }
			}),
			CFG // quoteValidityDays: 30
		);
		expect(events.find(e => e.type === 'expiry')).toMatchObject({ id: 'qd-3:expiry', at: '2026-07-01' });
	});

	it('suppresses expiry on terminal (WON/LOST) opportunities', () => {
		for (const status of ['WON', 'LOST'] as const) {
			const events = toCalendarEvents(
				baseSource({
					status,
					currentQuoteDraft: {
						id: 'qd-x',
						createdAt: new Date('2026-06-01T08:00:00.000Z'),
						validUntil: new Date('2026-06-12T00:00:00.000Z')
					}
				}),
				CFG
			);
			expect(events.some(e => e.type === 'expiry')).toBe(false);
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
