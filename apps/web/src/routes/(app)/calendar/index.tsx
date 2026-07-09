// apps/web/src/routes/(app)/calendar/index.tsx
import { FixedPageLayout } from '@/components/FixedPageLayout.component';
import { SectionError } from '@/components/SectionError.component';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import { calendarEventsQueryOptions } from '@/lib/queries/calendar.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { calendarEventStyle } from '@/lib/utils/calendar.utils';
import type { MoreLinkAction, MoreLinkArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { useTheme } from '@mui/material/styles';
import type { CalendarEventType } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarMoreEvent, CalendarView } from './-components/calendar-views';
import { CalendarTodayNumber } from './-components/CalendarDayCell.component';
import { CalendarEmpty } from './-components/CalendarEmpty.component';
import { CalendarMorePopover, EventContent } from './-components/CalendarEvent.component';
import { CalendarThemeStyles } from './-components/CalendarThemeStyles.component';
import { CalendarToolbar } from './-components/CalendarToolbar.component';
import { SubscribeModal } from './-components/SubscribeModal.component';

// The route prefetches a single wide window (−60d…+180d) and passes it to FullCalendar as a
// static events array. Month/week navigation stays within this window without refetching.
const WINDOW_PAST_DAYS = 60;
const WINDOW_FUTURE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

// Anchored to the START of the current UTC day — NOT `Date.now()`. The window string feeds the
// query key; millisecond precision would differ between the loader call and every render, making
// `useSuspenseQuery` miss the prefetched cache and refetch in a loop. Day granularity keeps it
// stable across the loader + all renders within the same day.
function windowRange(): { from: string; to: string } {
	const now = new Date();
	const startOfDayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	return {
		from: new Date(startOfDayMs - WINDOW_PAST_DAYS * DAY_MS).toISOString(),
		to: new Date(startOfDayMs + WINDOW_FUTURE_DAYS * DAY_MS).toISOString()
	};
}

export const Route = createFileRoute('/(app)/calendar/')({
	// The in-app calendar read is open to any member (not subscription-gated) — only the iCal
	// phone-sync setup requires a subscription. It always shows ONLY the signed-in user's own
	// assignments (no org-wide view, no toggle).
	loader: ({ context }) => {
		const { from, to } = windowRange();
		return Promise.all([
			context.queryClient.ensureQueryData(calendarEventsQueryOptions(from, to)),
			context.queryClient.ensureQueryData(billingStatusQueryOptions),
			context.queryClient.ensureQueryData(myMembershipQueryOptions)
		]);
	},
	errorComponent: SectionError,
	component: CalendarPage
});

function CalendarPage() {
	const { tokens } = useTheme();
	const navigate = useNavigate();
	const calendarRef = useRef<FullCalendar>(null);
	// Wraps FullCalendar; we replay a short cross-fade on it whenever the visible range changes.
	const gridRef = useRef<HTMLDivElement>(null);
	// Memoized so the window (and thus the query key) is computed once per mount, never per render.
	const { from, to } = useMemo(() => windowRange(), []);
	const { data: events } = useSuspenseQuery(calendarEventsQueryOptions(from, to));
	const { data: billing } = useSuspenseQuery(billingStatusQueryOptions);
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);

	const isEntitled = isBillingEntitled(billing.state);
	const isOwner = me.role === 'OWNER';

	// FullCalendar is a client-only widget (it touches the DOM + reads window size). Gate its
	// render behind a mounted flag so SSR emits no calendar markup and there's no hydration
	// mismatch. Data is already SSR-prefetched via the loader, so this only defers the chrome.
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setMounted(true);
	}, []);

	const isMobile = mounted && window.innerWidth < 768;
	const initialView: CalendarView = isMobile ? 'listMonth' : 'dayGridMonth';
	const [view, setView] = useState<CalendarView>(initialView);
	// The current view's range start (1st of the visible month / start of week), captured from
	// datesSet. Drives the toolbar's month-year picker label. Null until FullCalendar mounts.
	const [currentDate, setCurrentDate] = useState<Date | null>(null);
	const [subscribeOpen, setSubscribeOpen] = useState(false);
	// "+N meer" popover — coordinate-anchored (portaled), showing only that day's HIDDEN events.
	const [morePopover, setMorePopover] = useState<{
		position: { top: number; left: number };
		items: CalendarMoreEvent[];
	} | null>(null);

	const api = () => calendarRef.current?.getApi();

	// Replay a subtle fade-up on the grid — called from datesSet so every range change (prev/next,
	// month/year jump, view switch, and the first mount) animates the freshly-rendered content in.
	const animateGrid = (): void => {
		gridRef.current?.animate(
			[
				{ opacity: 0, transform: 'translateY(6px)' },
				{ opacity: 1, transform: 'translateY(0)' }
			],
			{ duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
		);
	};

	const changeView = (next: CalendarView): void => {
		setView(next);
		api()?.changeView(next);
	};

	const openOpportunity = (id: string): void => {
		void navigate({ to: '/opportunities/$id', params: { id } });
	};

	const fcEvents = events.map(event => {
		const style = calendarEventStyle(tokens, event.type);
		return {
			id: event.id,
			title: event.title,
			start: event.at,
			allDay: event.allDay,
			backgroundColor: style.bg,
			borderColor: style.edge,
			textColor: style.fg,
			extendedProps: { opportunityId: event.opportunityId, type: event.type }
		};
	});

	return (
		<>
			<CalendarThemeStyles />
			<FixedPageLayout
				header={
					<Box sx={{ mb: 2 }}>
						<CalendarToolbar
							currentDate={currentDate}
							view={view}
							onPrev={() => api()?.prev()}
							onNext={() => api()?.next()}
							onToday={() => api()?.today()}
							onJump={date => api()?.gotoDate(date)}
							onChangeView={changeView}
							onSubscribe={() => setSubscribeOpen(true)}
						/>
					</Box>
				}
				bodySx={{ overflowX: 'auto' }}
			>
				{mounted ? (
					// Min-width so the grid fills wide viewports but scrolls horizontally when narrow;
					// height='auto' lets it grow past the viewport so the body scrolls vertically.
					<Box className='oc-calendar' ref={gridRef} sx={{ minWidth: 880 }}>
						<FullCalendar
							ref={calendarRef}
							plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
							initialView={initialView}
							headerToolbar={false}
							locale='nl'
							firstDay={1}
							height='auto'
							nowIndicator
							dayMaxEvents={3}
							allDaySlot
							events={fcEvents}
							datesSet={arg => {
								setCurrentDate(arg.view.currentStart);
								setView(arg.view.type as CalendarView);
								animateGrid();
							}}
							// Today's month number is a centered accent circle; other cells keep the default text.
							dayCellContent={arg =>
								arg.view.type === 'dayGridMonth' && arg.isToday ? (
									<CalendarTodayNumber day={arg.date.getDate()} />
								) : (
									arg.dayNumberText
								)
							}
							eventContent={arg => (
								<EventContent
									view={arg.view.type}
									type={arg.event.extendedProps.type as CalendarEventType}
									time={arg.timeText}
									title={arg.event.title}
									allDay={arg.event.allDay}
									opportunityId={arg.event.extendedProps.opportunityId as string}
									onOpen={openOpportunity}
								/>
							)}
							noEventsContent={() => <CalendarEmpty />}
							// "+N meer" → our own portaled MUI popover, anchored at the click point and listing
							// only the HIDDEN events. Returning a truthy non-string from moreLinkClick suppresses
							// FullCalendar's own popover entirely (see internal handleMoreLinkClick: only a falsy /
							// 'popover' / view-name return triggers built-in behavior) — its popover isn't portaled
							// (clips on the scroll container) and crashes on the detached more-link anchor.
							moreLinkContent={arg => <ButtonBase sx={{ width: '100%' }}>+ {arg.num} meer</ButtonBase>}
							moreLinkClick={
								((arg: MoreLinkArg) => {
									const jsEvent = arg.jsEvent as MouseEvent;
									setMorePopover({
										position: { top: jsEvent.clientY, left: jsEvent.clientX },
										items: arg.hiddenSegs.map(seg => ({
											id: seg.event.id,
											opportunityId: seg.event.extendedProps.opportunityId as string,
											type: seg.event.extendedProps.type as CalendarEventType,
											title: seg.event.title
										}))
									});
									return true;
								}) as unknown as MoreLinkAction
							}
						/>
					</Box>
				) : null}
			</FixedPageLayout>

			<SubscribeModal
				open={subscribeOpen}
				isEntitled={isEntitled}
				isOwner={isOwner}
				onClose={() => setSubscribeOpen(false)}
			/>

			<CalendarMorePopover
				position={morePopover?.position ?? null}
				items={morePopover?.items ?? []}
				onOpen={openOpportunity}
				onClose={() => setMorePopover(null)}
			/>
		</>
	);
}
