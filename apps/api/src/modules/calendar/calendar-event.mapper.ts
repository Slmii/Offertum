// apps/api/src/modules/calendar/calendar-event.mapper.ts
import type { OpportunityStatus } from '@/generated/prisma/enums';
import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import type { CalendarEvent, CalendarEventType } from '@offertum/shared';
import { CALENDAR_EVENT_TYPE_META } from './calendar-event-type';

export interface CalendarEventSource {
	opportunityId: string;
	status: OpportunityStatus;
	dismissedAt: Date | null;
	customerName: string | null;
	customerDeadline: Date | null;
	customerAppointment: Date | null;
	// The opp's current (latest) quote draft — drives the `expiry` marker.
	currentQuoteDraft: { id: string; validUntil: Date | null; createdAt: Date } | null;
	latestSentReplyDraftAt: Date | null;
	priorCheckInCount: number;
}

export interface OrgCalendarConfig {
	quoteValidityDays: number;
	followUpCadenceDays: number;
	followUpMaxCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * DAY_MS);
}

/**
 * `YYYY-MM-DD` in the business time zone. All-day events emit a date-only `at` so they are
 * timezone-independent: the same calendar day renders in the in-app calendar AND the subscribed
 * iCal feed regardless of the viewer's browser zone (a full UTC timestamp would shift a day for
 * evening values / non-NL viewers).
 */
function businessDateString(date: Date): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: BUSINESS_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(date);
}

function buildEvent(
	id: string,
	opportunityId: string,
	type: CalendarEventType,
	label: string,
	at: Date
): CalendarEvent {
	const allDay = CALENDAR_EVENT_TYPE_META[type].allDay;
	return {
		id,
		opportunityId,
		type,
		title: `${CALENDAR_EVENT_TYPE_META[type].labelPrefix} — ${label}`,
		// All-day → date-only (tz-independent); timed → full UTC instant (viewer renders local).
		at: allDay ? businessDateString(at) : at.toISOString(),
		allDay
	};
}

/**
 * Project a single opportunity's current rows into calendar events. Pure — no I/O. Dismissed
 * opportunities yield no events. Window filtering happens in the service, not here.
 */
export function toCalendarEvents(src: CalendarEventSource, cfg: OrgCalendarConfig): CalendarEvent[] {
	if (src.dismissedAt !== null) {
		return [];
	}

	const label = src.customerName ?? 'Aanvraag';
	const events: CalendarEvent[] = [];

	if (src.customerAppointment) {
		events.push(
			buildEvent(
				`${src.opportunityId}:appointment`,
				src.opportunityId,
				'appointment',
				label,
				src.customerAppointment
			)
		);
	}

	if (src.customerDeadline) {
		events.push(
			buildEvent(`${src.opportunityId}:deadline`, src.opportunityId, 'deadline', label, src.customerDeadline)
		);
	}

	// The expiry marker is suppressed on terminal deals — a WON quote is accepted and a LOST one is
	// dead, so "Offerte verloopt" would just be noise on the calendar.
	const isTerminalStatus = src.status === 'WON' || src.status === 'LOST';
	if (!isTerminalStatus) {
		// `expiry` shows as soon as a quote exists (sent or not), from the current draft's stored
		// validUntil — the same date the PDF prints + the opp detail shows. Legacy drafts (no stored
		// value) fall back to createdAt + the org window.
		if (src.currentQuoteDraft) {
			const draft = src.currentQuoteDraft;
			const expiryAt = draft.validUntil ?? addDays(draft.createdAt, cfg.quoteValidityDays);
			events.push(buildEvent(`${draft.id}:expiry`, src.opportunityId, 'expiry', label, expiryAt));
		}
	}

	// Follow-up: an APPROXIMATE "nudge due" marker — REPLIED, a sent reply draft exists, and the
	// per-opp check-in cap isn't exhausted (cap 0 disables it). This is intentionally looser than
	// the silence-check-in scheduler (which also requires the latest draft to be SENT + org
	// entitlement); the calendar shows a hint, the scheduler remains the source of truth for sends.
	const followUpEligible =
		src.status === 'REPLIED' &&
		src.latestSentReplyDraftAt !== null &&
		cfg.followUpMaxCount > 0 &&
		src.priorCheckInCount < cfg.followUpMaxCount;
	if (followUpEligible && src.latestSentReplyDraftAt) {
		events.push(
			buildEvent(
				`${src.opportunityId}:follow_up`,
				src.opportunityId,
				'follow_up',
				label,
				addDays(src.latestSentReplyDraftAt, cfg.followUpCadenceDays)
			)
		);
	}

	return events;
}
