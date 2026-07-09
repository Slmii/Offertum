import { BodySmall } from '@/components/Text.component';
import { calendarEventLabel, calendarEventStyle, type CalendarEventStyle } from '@/lib/utils/calendar.utils';
import type { AppTokens } from '@/lib/utils/theme.utils';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import type { CalendarEventType } from '@offertum/shared';
import { useRef, useState, type MouseEvent } from 'react';
import type { CalendarMoreEvent } from './calendar-views';

interface TriggerProps {
	onClick: (event: MouseEvent<HTMLElement>) => void;
	onMouseLeave: () => void;
}

/**
 * Click-to-open MUI popover that closes shortly after the pointer leaves the anchor or the popover.
 * The short delay lets the pointer travel from the anchor onto the popover (to click inside it);
 * the popover paper captures the mouse (see callers) so it doesn't bleed hover to elements behind.
 */
function useLeaveClosePopover() {
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const cancelClose = (): void => {
		if (timer.current) {
			clearTimeout(timer.current);
			timer.current = null;
		}
	};
	const scheduleClose = (): void => {
		cancelClose();
		timer.current = setTimeout(() => setAnchorEl(null), 150);
	};
	const open = (event: MouseEvent<HTMLElement>): void => {
		cancelClose();
		setAnchorEl(event.currentTarget);
	};
	const close = (): void => {
		cancelClose();
		setAnchorEl(null);
	};

	return { anchorEl, open, close, cancelClose, scheduleClose };
}

/**
 * Per-event content for every FullCalendar view + a click-opened card (the design's `EventTooltip`).
 * All-day events (month cells + the week all-day row) render a transparent dot + time + title row
 * that tints on hover; timed week events keep FullCalendar's tinted chip. The card closes when the
 * pointer leaves it (or the event).
 */
export function EventContent({
	view,
	type,
	time,
	title,
	allDay,
	opportunityId,
	onOpen
}: {
	view: string;
	type: CalendarEventType;
	time: string;
	title: string;
	allDay: boolean;
	opportunityId: string;
	onOpen: (opportunityId: string) => void;
}) {
	const { tokens } = useTheme();
	const style = calendarEventStyle(tokens, type);
	const popover = useLeaveClosePopover();
	const triggerProps: TriggerProps = { onClick: popover.open, onMouseLeave: popover.scheduleClose };

	// Agenda (list) view: the whole row opens the opportunity directly (no hover card). The title
	// renders normally and a transparent ButtonBase is stretched over the entire row — the row's
	// `position: relative` (theme) makes `inset: 0` cover the time + dot + title columns.
	if (view === 'listMonth') {
		return (
			<>
				<Box component='span' sx={{ fontSize: 13, color: tokens.color.ink1 }}>
					{title}
				</Box>
				<ButtonBase
					aria-label={title}
					onClick={() => onOpen(opportunityId)}
					sx={{ position: 'absolute', inset: 0, borderRadius: 0 }}
				/>
			</>
		);
	}

	return (
		<>
			<EventBody
				view={view}
				allDay={allDay}
				style={style}
				time={time}
				title={title}
				triggerProps={triggerProps}
			/>
			<Popover
				open={Boolean(popover.anchorEl)}
				anchorEl={popover.anchorEl}
				onClose={popover.close}
				disableRestoreFocus
				disableScrollLock
				sx={{ pointerEvents: 'none' }}
				anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
				transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
				slotProps={{
					paper: {
						// Root is click-through (no backdrop block); the paper captures the mouse so it doesn't
						// bleed to events behind it and stays open while hovered (its action stays reachable).
						onMouseEnter: popover.cancelClose,
						onMouseLeave: popover.scheduleClose,
						sx: { ...popoverPaperSx(tokens), mt: -0.75, maxWidth: 280 }
					}
				}}
			>
				<EventHoverCard
					type={type}
					title={title}
					onOpen={() => {
						popover.close();
						onOpen(opportunityId);
					}}
				/>
			</Popover>
		</>
	);
}

/** The view-specific inner element of an event (kept separate from the popover wiring above). */
function EventBody({
	view,
	allDay,
	style,
	time,
	title,
	triggerProps
}: {
	view: string;
	allDay: boolean;
	style: CalendarEventStyle;
	time: string;
	title: string;
	triggerProps: TriggerProps;
}) {
	const { tokens } = useTheme();

	// Timed week events: a single line (time + title) inside FullCalendar's tinted chip — never
	// clips on short events, whatever the chip height.
	if (view === 'timeGridWeek' && !allDay) {
		return (
			<ButtonBase
				{...triggerProps}
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 0.5,
					px: 0.5,
					py: 0.5,
					width: '100%',
					height: '100%',
					minWidth: 0,
					overflow: 'hidden'
				}}
			>
				{time && (
					<Box component='span' className='tabular' sx={{ fontSize: 10, opacity: 0.85, flexShrink: 0 }}>
						{time}
					</Box>
				)}
				<Box
					component='span'
					sx={{
						fontSize: 11,
						fontWeight: 'medium',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap'
					}}
				>
					{title}
				</Box>
			</ButtonBase>
		);
	}

	// All-day events (month cells + the week all-day row): transparent dot + time + title row that
	// tints on hover.
	if (view === 'dayGridMonth' || view === 'timeGridWeek') {
		return (
			<ButtonBase
				{...triggerProps}
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'flex-start',
					gap: 0.75,
					width: '100%',
					minWidth: 0,
					px: 0.75,
					py: 0.5,
					borderRadius: '4px',
					overflow: 'hidden',
					transition: 'background-color 180ms',
					'&:hover': { backgroundColor: style.bg }
				}}
			>
				<Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: style.dot, flexShrink: 0 }} />
				{time && (
					<Box
						component='span'
						className='tabular'
						sx={{ fontSize: 11, color: tokens.color.ink4, flexShrink: 0 }}
					>
						{time}
					</Box>
				)}
				<Box
					component='span'
					sx={{
						fontSize: 12,
						color: tokens.color.ink2,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						minWidth: 0
					}}
				>
					{title}
				</Box>
			</ButtonBase>
		);
	}

	// Agenda (list) view.
	return (
		<ButtonBase {...triggerProps} sx={{ fontSize: 13, color: tokens.color.ink1 }}>
			{title}
		</ButtonBase>
	);
}

/**
 * The "+N meer" popover — a single MUI popover (portaled, so it isn't clipped by the calendar's
 * scroll container) listing the hidden events. Anchored by click coordinates rather than a DOM
 * element: FullCalendar re-renders the more-link when it opens its own (hidden) popover, which would
 * detach an element anchor and crash MUI's positioning.
 */
export function CalendarMorePopover({
	position,
	items,
	onOpen,
	onClose
}: {
	position: { top: number; left: number } | null;
	items: CalendarMoreEvent[];
	onOpen: (opportunityId: string) => void;
	onClose: () => void;
}) {
	const { tokens } = useTheme();
	// Open the card a few px up-and-left of the click so the cursor starts INSIDE it. Otherwise the
	// card opens below the pointer, the pointer never enters it, and `mouseleave` never fires — which
	// is why close-on-hover-out appeared broken.
	const anchorPosition = position ? { top: position.top - 10, left: position.left - 10 } : undefined;
	return (
		<Popover
			open={position !== null}
			anchorReference='anchorPosition'
			anchorPosition={anchorPosition}
			onClose={onClose}
			slotProps={{
				paper: {
					// Close as soon as the pointer leaves the card — same feel as the event hover cards.
					// It's click-opened and the cursor starts inside (see anchorPosition), so a plain
					// mouseleave suffices: no anchor-travel gap and no in-card action to keep reachable.
					onMouseLeave: onClose,
					sx: { ...popoverPaperSx(tokens), maxWidth: 300 }
				}
			}}
		>
			{/* Each hidden event is the same card as the single-event hover card, stacked in a list. */}
			<Stack useFlexGap spacing={1.5} divider={<Divider sx={{ borderColor: tokens.color.line }} />}>
				{items.map(item => (
					<EventHoverCard
						key={item.id}
						type={item.type}
						title={item.title}
						onOpen={() => {
							onClose();
							onOpen(item.opportunityId);
						}}
					/>
				))}
			</Stack>
		</Popover>
	);
}

/** Rich card body — title, a type pill, and a clickable "open" affordance (design 1:1). */
function EventHoverCard({ type, title, onOpen }: { type: CalendarEventType; title: string; onOpen: () => void }) {
	const { tokens } = useTheme();
	const style = calendarEventStyle(tokens, type);
	return (
		<Box>
			<BodySmall fontWeight='bold' color='text.primary' sx={{ display: 'block', mb: 1 }}>
				{title}
			</BodySmall>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
				<Box
					component='span'
					sx={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 0.5,
						px: 1,
						py: 0.25,
						borderRadius: `${tokens.radius.sm}px`,
						backgroundColor: style.bg,
						color: style.fg,
						fontSize: 11,
						fontWeight: 'medium'
					}}
				>
					<Box sx={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: style.dot }} />
					{calendarEventLabel(type)}
				</Box>
				<ButtonBase
					onClick={onOpen}
					sx={{
						ml: 'auto',
						px: 0.5,
						py: 0.25,
						borderRadius: '4px',
						color: tokens.color.accent[500],
						fontFamily: tokens.font.sans,
						fontSize: 13,
						fontWeight: 'medium',
						'&:hover': { color: tokens.color.accent[700] }
					}}
				>
					Open offerte →
				</ButtonBase>
			</Box>
		</Box>
	);
}

/** Shared popover-paper styling (surface card). `pointerEvents: auto` re-enables the mouse on the
 * paper since the popover root is click-through. */
function popoverPaperSx(tokens: AppTokens) {
	return {
		pointerEvents: 'auto' as const,
		p: 1.25,
		backgroundColor: tokens.color.surface,
		border: `1px solid ${tokens.color.line}`,
		borderRadius: `${tokens.radius.md}px`,
		boxShadow: tokens.shadow[2]
	};
}
