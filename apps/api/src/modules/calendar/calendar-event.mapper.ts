// apps/api/src/modules/calendar/calendar-event.mapper.ts
import type { OpportunityStatus } from '@/generated/prisma/enums';
import type { CalendarEvent, CalendarEventType } from '@offertum/shared';
import { CALENDAR_EVENT_TYPE_META } from './calendar-event-type';

export interface CalendarEventSource {
	opportunityId: string;
	status: OpportunityStatus;
	dismissedAt: Date | null;
	customerName: string | null;
	customerDeadline: Date | null;
	customerAppointment: Date | null;
	currentQuoteDraft: { id: string; sentAt: Date | null; validUntil: Date | null; createdAt: Date } | null;
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

function buildEvent(
	id: string,
	opportunityId: string,
	type: CalendarEventType,
	label: string,
	at: Date
): CalendarEvent {
	return {
		id,
		opportunityId,
		type,
		title: `${CALENDAR_EVENT_TYPE_META[type].labelPrefix} — ${label}`,
		at: at.toISOString(),
		allDay: CALENDAR_EVENT_TYPE_META[type].allDay
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

	if (src.currentQuoteDraft) {
		const draft = src.currentQuoteDraft;
		// `sent` marks the day the quote went out — only once it's actually been sent.
		if (draft.sentAt) {
			events.push(buildEvent(`${draft.id}:sent`, src.opportunityId, 'sent', label, draft.sentAt));
		}
		// `expiry` shows as soon as the quote exists (sent or not), from the stored validUntil — the
		// same date the PDF prints + the opp detail shows. Legacy drafts (no stored value) fall back
		// to createdAt + the org window.
		const expiryAt = draft.validUntil ?? addDays(draft.createdAt, cfg.quoteValidityDays);
		events.push(buildEvent(`${draft.id}:expiry`, src.opportunityId, 'expiry', label, expiryAt));
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
