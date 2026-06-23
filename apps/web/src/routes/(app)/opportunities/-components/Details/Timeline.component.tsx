import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { toReadableDate, toReadableDateTime } from '@/lib/utils/date.utils';
import { OPPORTUNITY_STATUS_LABELS_NL, OPPORTUNITY_URGENCY_LABELS_NL } from '@/lib/utils/opportunity.utils';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { OpportunityFieldChange, OpportunityTimelineEvent, OpportunityUrgency } from '@offertum/shared';
import type { ReactNode } from 'react';

const TIMELINE_DISMISS_REASON_LABELS_NL: Record<'not_a_quote' | 'duplicate' | 'spam' | 'other', string> = {
	not_a_quote: 'Geen offerteaanvraag',
	duplicate: 'Duplicaat',
	spam: 'Spam',
	other: 'Andere reden'
};

const TIMELINE_FIELD_LABELS_NL: Record<OpportunityFieldChange['field'], string> = {
	urgency: 'Urgentie',
	address: 'Adres',
	customerDeadline: 'Deadline',
	customerAppointment: 'Afspraak'
};

/** Tone family per event kind — drives the dot icon color + the chip tint/border/text. */
type TimelineTone = 'neutral' | 'accent' | 'cold' | 'won' | 'warning' | 'info';

interface TimelineEventVisual {
	icon: AppIconName;
	tone: TimelineTone;
	chipLabel: string;
}

function formatFieldValue(change: OpportunityFieldChange, side: 'before' | 'after'): string {
	const value = change[side];
	if (value === null) {
		return '—';
	}
	switch (change.field) {
		case 'urgency':
			return OPPORTUNITY_URGENCY_LABELS_NL[value as OpportunityUrgency];
		case 'customerDeadline':
			return toReadableDate(value);
		case 'customerAppointment':
			return toReadableDateTime(value);
		case 'address':
			return value;
	}
}

/** Icon + tone + chip text per kind — the chip label is the short Title-case tag in the design. */
function visualForEvent(event: OpportunityTimelineEvent): TimelineEventVisual {
	switch (event.kind) {
		case 'received_via_mailbox':
			return { icon: 'inbox', tone: 'neutral', chipLabel: 'Binnengekomen' };
		case 'status_changed':
			return { icon: 'arrow-right', tone: 'neutral', chipLabel: 'Status' };
		case 'auto_cold':
			return { icon: 'snowflake', tone: 'cold', chipLabel: 'Auto-koud' };
		case 'dismissed':
			return { icon: 'x', tone: 'warning', chipLabel: 'Afgewezen' };
		case 'undismissed':
			return { icon: 'refresh', tone: 'won', chipLabel: 'Hersteld' };
		case 'fields_updated':
			return { icon: 'pen-line', tone: 'neutral', chipLabel: 'Gegevens' };
		case 'assigned':
			return { icon: 'user-check', tone: 'accent', chipLabel: 'Toewijzing' };
		case 'quote_created':
			return { icon: 'file-text', tone: 'accent', chipLabel: 'Offerte' };
		case 'quote_pdf_generated':
			return { icon: 'file-text', tone: 'accent', chipLabel: 'Offerte-PDF' };
	}
}

/** Bold inline name (actor / assignee), matching the design's emphasized names in the headline. */
function Strong({ children }: { children: ReactNode }) {
	return (
		<Box component='span' sx={{ fontWeight: 'bold' }}>
			{children}
		</Box>
	);
}

/**
 * The headline sentence per kind. Actor names are embedded inline + bolded (no separate
 * "door X" suffix) to match the design.
 */
function headlineForEvent(event: OpportunityTimelineEvent): ReactNode {
	switch (event.kind) {
		case 'received_via_mailbox':
			return `Aanvraag binnengekomen via ${event.mailboxEmail}`;
		case 'status_changed': {
			const prev = event.previousStatus ? OPPORTUNITY_STATUS_LABELS_NL[event.previousStatus] : null;
			const next = OPPORTUNITY_STATUS_LABELS_NL[event.nextStatus];
			return (
				<>
					Status: {prev ? `${prev} → ` : ''}
					<Strong>{next}</Strong>
					{event.actorName && (
						<>
							{' door '}
							<Strong>{event.actorName}</Strong>
						</>
					)}
				</>
			);
		}
		case 'auto_cold':
			return `Automatisch op Koud gezet na ${event.daysSinceSent} dag${event.daysSinceSent === 1 ? '' : 'en'} stilte`;
		case 'dismissed': {
			const reason = TIMELINE_DISMISS_REASON_LABELS_NL[event.reason];
			return event.actorName ? (
				<>
					<Strong>{event.actorName}</Strong>
					{` wees de aanvraag af — ${reason}`}
				</>
			) : (
				`Aanvraag afgewezen — ${reason}`
			);
		}
		case 'undismissed':
			return event.actorName ? (
				<>
					<Strong>{event.actorName}</Strong>
					{' zette de aanvraag terug'}
				</>
			) : (
				'Aanvraag teruggezet uit afgewezen'
			);
		case 'fields_updated': {
			const suffix = `wijzigde ${event.changes.length} veld${event.changes.length === 1 ? '' : 'en'}`;
			return event.actorName ? (
				<>
					<Strong>{event.actorName}</Strong> {suffix}
				</>
			) : (
				`${event.changes.length} veld${event.changes.length === 1 ? '' : 'en'} gewijzigd`
			);
		}
		case 'assigned': {
			const next = event.nextAssigneeName ?? (event.nextAssigneeUserId ? 'onbekend' : null);
			if (next === null) {
				return event.actorName ? (
					<>
						<Strong>{event.actorName}</Strong>
						{' verwijderde de toewijzing'}
					</>
				) : (
					'Toewijzing verwijderd'
				);
			}
			return event.actorName ? (
				<>
					<Strong>{event.actorName}</Strong>
					{' wees toe aan '}
					<Strong>{next}</Strong>
				</>
			) : (
				<>
					Toegewezen aan <Strong>{next}</Strong>
				</>
			);
		}
		case 'quote_created': {
			const label = `Offerte opgesteld (${event.lineCount} ${event.lineCount === 1 ? 'regel' : 'regels'})`;
			return event.actorName ? (
				<>
					{`${label} door `}
					<Strong>{event.actorName}</Strong>
				</>
			) : (
				label
			);
		}
		case 'quote_pdf_generated':
			return event.actorName ? (
				<>
					{'Offerte-PDF gegenereerd door '}
					<Strong>{event.actorName}</Strong>
				</>
			) : (
				'Offerte-PDF gegenereerd'
			);
	}
}

/**
 * Opportunity activity timeline — ported pixel-for-pixel from the design's `Tijdlijn`. A single
 * vertical rail threads paper-filled dots with tone-colored icons; each row carries a Title-case
 * tone chip, a headline with bolded actor names, and a year-less timestamp. Kind-specific detail
 * bodies render below the headline (a WAS/NU diff card for `fields_updated`, the dismiss note for
 * `dismissed`, the filename for `quote_pdf_generated`). Covers every `OpportunityTimelineEvent`
 * variant. Render the header + outer card at the call site (matches the sibling "Gesprek" section).
 */
export function Timeline({ events }: { events: OpportunityTimelineEvent[] }) {
	return (
		<Box sx={{ position: 'relative' }}>
			{/* Rail behind the dots, threading their centers (dot is 32px → center at x=16). */}
			<Box
				sx={theme => ({
					position: 'absolute',
					left: 15,
					top: 16,
					bottom: 16,
					width: 2,
					backgroundColor: theme.tokens.color.line
				})}
			/>
			<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
				{events.map(event => (
					<TimelineRow key={event.id} event={event} />
				))}
			</Box>
		</Box>
	);
}

function TimelineRow({ event }: { event: OpportunityTimelineEvent }) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const { icon, tone, chipLabel } = visualForEvent(event);

	const tones: Record<TimelineTone, { tint: string; fg: string; border: string }> = {
		neutral: { tint: c.paper2, fg: c.ink2, border: c.line },
		accent: { tint: c.accent[50], fg: c.accent[700], border: c.accent[300] },
		cold: { tint: c.cold[50], fg: c.cold[700], border: c.line },
		won: { tint: c.won[50], fg: c.won[700], border: c.line },
		warning: { tint: c.pending[50], fg: c.pending[700], border: c.line },
		info: { tint: c.info[50], fg: c.info[700], border: c.line }
	};
	const t = tones[tone];

	return (
		<Box sx={{ position: 'relative', display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
			<Box
				sx={{
					flexShrink: 0,
					width: 32,
					height: 32,
					borderRadius: tokens.radius.full,
					backgroundColor: c.paper,
					border: `1px solid ${c.line}`,
					color: t.fg,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					zIndex: 1
				}}
			>
				<AppIcon name={icon} size='small' />
			</Box>

			<Box sx={{ flex: 1, minWidth: 0, pt: '4px' }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
					<Box
						component='span'
						sx={{
							flexShrink: 0,
							px: '9px',
							py: '3px',
							borderRadius: `${tokens.radius.md}px`,
							backgroundColor: t.tint,
							border: `1px solid ${t.border}`,
							color: t.fg,
							fontFamily: tokens.font.sans,
							fontSize: 12.5,
							fontWeight: 'bold',
							lineHeight: 1.2,
							whiteSpace: 'nowrap'
						}}
					>
						{chipLabel}
					</Box>
					<Box component='span' sx={{ fontSize: 14, color: c.ink1, lineHeight: 1.4 }}>
						{headlineForEvent(event)}
					</Box>
					<Box component='span' sx={{ fontSize: 13, color: c.ink4, whiteSpace: 'nowrap' }}>
						· {toReadableDate(event.occurredAt, 'D MMM HH:mm')}
					</Box>
				</Box>

				<TimelineDetail event={event} />
			</Box>
		</Box>
	);
}

/** Kind-specific detail body rendered under the headline (only some kinds have one). */
function TimelineDetail({ event }: { event: OpportunityTimelineEvent }) {
	const { tokens } = useTheme();
	const c = tokens.color;

	if (event.kind === 'fields_updated') {
		return (
			<Box
				sx={{
					mt: 1.25,
					px: '18px',
					py: '14px',
					backgroundColor: c.surfaceSunk,
					borderRadius: `${tokens.radius.lg}px`,
					display: 'flex',
					flexDirection: 'column',
					gap: 1.5
				}}
			>
				{event.changes.map(change => (
					<Box
						key={change.field}
						sx={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 1.5, alignItems: 'start' }}
					>
						<Box sx={{ fontSize: 13, color: c.ink3, fontWeight: 'medium', pt: '1px' }}>
							{TIMELINE_FIELD_LABELS_NL[change.field]}
						</Box>
						<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
							<DiffLine label='Was' value={formatFieldValue(change, 'before')} struck />
							<DiffLine label='Nu' value={formatFieldValue(change, 'after')} />
						</Box>
					</Box>
				))}
			</Box>
		);
	}

	if (event.kind === 'dismissed' && event.notes) {
		return <Box sx={{ mt: 0.5, fontSize: 13, fontStyle: 'italic', color: c.ink3 }}>“{event.notes}”</Box>;
	}

	if (event.kind === 'auto_cold') {
		return (
			<Box sx={{ mt: 0.5, fontSize: 13, color: c.ink4 }}>
				Drempel: {event.coldAfterDays} dag{event.coldAfterDays === 1 ? '' : 'en'}.
			</Box>
		);
	}

	if (event.kind === 'undismissed' && event.previousReason) {
		return (
			<Box sx={{ mt: 0.5, fontSize: 13, color: c.ink4 }}>
				Eerdere reden: {TIMELINE_DISMISS_REASON_LABELS_NL[event.previousReason]}
			</Box>
		);
	}

	if (event.kind === 'quote_pdf_generated') {
		return (
			<Box
				sx={{
					mt: 0.5,
					fontSize: 13,
					color: c.ink3,
					display: 'inline-flex',
					alignItems: 'center',
					gap: 0.5
				}}
			>
				<AppIcon name='file-text' size='small' /> {event.filename}
			</Box>
		);
	}

	return null;
}

/** One "WAS …" / "NU …" line inside the fields_updated diff card. */
function DiffLine({ label, value, struck = false }: { label: string; value: string; struck?: boolean }) {
	const { tokens } = useTheme();
	const c = tokens.color;
	return (
		<Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
			<Box
				component='span'
				sx={{
					flexShrink: 0,
					width: 30,
					fontSize: 10,
					fontWeight: 'bold',
					letterSpacing: '0.06em',
					textTransform: 'uppercase',
					color: c.ink4
				}}
			>
				{label}
			</Box>
			<Box
				component='span'
				sx={{
					fontSize: 13.5,
					color: struck ? c.ink4 : c.ink1,
					textDecoration: struck ? 'line-through' : 'none'
				}}
			>
				{value}
			</Box>
		</Box>
	);
}
