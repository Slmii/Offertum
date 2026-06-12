// apps/api/src/modules/calendar/calendar.service.ts
import type { EnvSchema } from '@/config/env.schema';
import { ICAL_FEED_NO_ORGANIZATION, ICAL_FEED_TOKEN_NOT_FOUND } from '@/lib/errors';
import { serializeICalendar, type ICalEvent } from '@/lib/calendar/ical-serializer';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CalendarEvent, CalendarEventScope, IcalFeed } from '@offertum/shared';
import { randomBytes } from 'node:crypto';
import { toCalendarEvents } from './calendar-event.mapper';
import { CalendarRepository } from './calendar.repository';

const FEED_TOKEN_BYTES = 32;
const PROD_ID = '-//Offertum//Calendar//NL';
const FEED_WINDOW_PAST_DAYS = 30;
const FEED_WINDOW_FUTURE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

interface GetEventsOptions {
	scope: CalendarEventScope;
	requestingUserId: string | null;
	from: Date;
	to: Date;
}

@Injectable()
export class CalendarService {
	constructor(
		private readonly repository: CalendarRepository,
		private readonly config: ConfigService<EnvSchema, true>
	) {}

	/** Authenticated read: mapped events for the org, filtered to the requested window. */
	async getEvents(organizationId: string, options: GetEventsOptions): Promise<CalendarEvent[]> {
		const config = await this.repository.findOrgCalendarConfig(organizationId);
		if (!config) {
			return [];
		}
		const sources = await this.repository.findActiveSources(
			organizationId,
			options.scope,
			options.requestingUserId
		);
		const fromMs = options.from.getTime();
		const toMs = options.to.getTime();
		return sources
			.flatMap(source => toCalendarEvents(source, config))
			.filter(event => {
				const atMs = new Date(event.at).getTime();
				return atMs >= fromMs && atMs <= toMs;
			});
	}

	/** Public feed: resolve token → org → render a rolling-window VCALENDAR string. */
	async renderFeed(token: string): Promise<string> {
		const user = await this.repository.findUserByIcalToken(token);
		if (!user) {
			throw new NotFoundException(ICAL_FEED_TOKEN_NOT_FOUND);
		}
		if (!user.currentOrganizationId) {
			throw new NotFoundException(ICAL_FEED_NO_ORGANIZATION);
		}
		// Re-verify actual membership — `currentOrganizationId` is a stale-able pointer, and
		// this session-less path has no OrganizationGuard to do the check for it.
		if (!(await this.repository.isUserMemberOfOrganization(user.id, user.currentOrganizationId))) {
			throw new NotFoundException(ICAL_FEED_NO_ORGANIZATION);
		}
		const now = new Date();
		// Gate the persistent public feed behind subscription entitlement (same predicate as
		// EntitlementGuard: trialing/active/past_due). In-app reads stay open to any member, but
		// the feed is a session-less channel that would otherwise keep streaming customer data
		// after an org cancels. When not entitled we return a valid-but-empty calendar so the
		// subscribe URL stays live and refills automatically once the org resubscribes.
		if (!(await this.repository.isOrganizationEntitled(user.currentOrganizationId))) {
			return serializeICalendar({ prodId: PROD_ID, dtstamp: now, events: [] });
		}
		const from = new Date(now.getTime() - FEED_WINDOW_PAST_DAYS * DAY_MS);
		const to = new Date(now.getTime() + FEED_WINDOW_FUTURE_DAYS * DAY_MS);
		// Feed always shows the whole org (a subscribed feed has no per-user toggle).
		const events = await this.getEvents(user.currentOrganizationId, {
			scope: 'all',
			requestingUserId: null,
			from,
			to
		});
		const icalEvents: ICalEvent[] = events.map(event => ({
			uid: `${event.id}@offertum`,
			summary: event.title,
			at: new Date(event.at),
			allDay: event.allDay
		}));
		return serializeICalendar({ prodId: PROD_ID, dtstamp: now, events: icalEvents });
	}

	async getFeedToken(userId: string): Promise<IcalFeed> {
		const token = await this.repository.findIcalToken(userId);
		return { url: token ? this.feedUrl(token) : null };
	}

	async generateFeedToken(userId: string): Promise<IcalFeed> {
		const token = randomBytes(FEED_TOKEN_BYTES).toString('base64url');
		await this.repository.setIcalToken(userId, token);
		return { url: this.feedUrl(token) };
	}

	async revokeFeedToken(userId: string): Promise<IcalFeed> {
		await this.repository.setIcalToken(userId, null);
		return { url: null };
	}

	private feedUrl(token: string): string {
		const origin = this.config.get('WEB_ORIGIN', { infer: true });
		return `${origin}/api/calendar/ical/${token}.ics`;
	}
}
