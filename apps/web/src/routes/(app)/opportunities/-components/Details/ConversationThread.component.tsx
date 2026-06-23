import { AppIcon } from '@/components/AppIcon.component';
import { Avatar } from '@/components/Avatar.component';
import { toReadableDateTime } from '@/lib/utils/date.utils';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { CustomerReplyEntry, ReplyDraft } from '@offertum/shared';

/**
 * Conversation thread — ported 1:1 from the design's Werkruimte conversation column. Renders
 * the original customer email, our SENT reply drafts, and inbound/outbound customer-thread
 * messages as chat-style bubbles on a vertical spine, newest-at-top. Outbound (our replies)
 * get a send-icon tile node + accent bubble; inbound get a ring-avatar node + surface bubble.
 * Each bubble has a header band (sender · badges · time) above the body. Sent drafts carry a
 * "v{n} · verzonden" badge + an attachment count; inbound replies (beyond the original) carry
 * a won-tinted "Antwoord" badge.
 *
 * This is the read view. The active editable draft lives in the composer below the thread.
 */

interface OriginalEmail {
	subject: string | null;
	fromName: string | null;
	fromEmail: string | null;
	body: string;
	receivedAt: string;
}

interface ThreadBubbleData {
	id: string;
	direction: 'in' | 'out';
	who: string;
	timestamp: string;
	body: string;
	subject: string | null;
	version: number | null;
	attachmentsCount: number;
	hasReplyBadge: boolean;
	isCheckIn: boolean;
	wasCloser: boolean;
}

function buildBubbles(
	original: OriginalEmail,
	sentDrafts: ReplyDraft[],
	customerReplies: CustomerReplyEntry[]
): ThreadBubbleData[] {
	const bubbles: ThreadBubbleData[] = [];

	bubbles.push({
		id: `original:${original.receivedAt}`,
		direction: 'in',
		who: original.fromName ?? original.fromEmail ?? 'Klant',
		timestamp: original.receivedAt,
		body: original.body,
		subject: original.subject,
		version: null,
		attachmentsCount: 0,
		hasReplyBadge: false,
		isCheckIn: false,
		wasCloser: false
	});

	// Sent drafts oldest-first to assign stable v1..vN, then merged into the timeline.
	const sentOldestFirst = [...sentDrafts]
		.filter(draft => draft.status === 'sent' && draft.sentAt !== null)
		.sort((a, b) => (a.sentAt ?? '').localeCompare(b.sentAt ?? ''));

	sentOldestFirst.forEach((draft, index) => {
		bubbles.push({
			id: `draft:${draft.id}`,
			direction: 'out',
			who: 'Jij',
			timestamp: draft.sentAt ?? draft.updatedAt,
			body: draft.body,
			subject: null,
			version: index + 1,
			attachmentsCount: draft.attachments.length,
			hasReplyBadge: false,
			// A sent draft Offertum generated as an automatic silence check-in.
			isCheckIn: draft.kind === 'check_in',
			wasCloser: false
		});
	});

	for (const reply of customerReplies) {
		const isOutbound = reply.direction === 'outbound';
		bubbles.push({
			id: `reply:${reply.id}`,
			direction: isOutbound ? 'out' : 'in',
			who: reply.fromName ?? reply.fromEmail ?? (isOutbound ? 'Jij' : 'Klant'),
			timestamp: reply.receivedAt,
			body: reply.body,
			subject: null,
			version: null,
			attachmentsCount: 0,
			// Only inbound customer replies carry the "Antwoord" badge; the should-reply
			// classifier may have flagged the message as a conversation closer (no draft generated).
			hasReplyBadge: !isOutbound,
			isCheckIn: false,
			wasCloser: !isOutbound && reply.wasDetectedAsCloser
		});
	}

	// Newest-at-top for display.
	return bubbles.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function ConversationThread({
	original,
	sentDrafts,
	customerReplies
}: {
	original: OriginalEmail;
	sentDrafts: ReplyDraft[];
	customerReplies: CustomerReplyEntry[];
}) {
	const bubbles = buildBubbles(original, sentDrafts, customerReplies);
	const { tokens } = useTheme();

	return (
		<Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 2.25, mb: 2.75 }}>
			{/* Vertical thread spine — runs through the centre of the avatar nodes. */}
			<Box
				aria-hidden='true'
				sx={{
					position: 'absolute',
					left: 19,
					top: 8,
					bottom: 8,
					width: 2,
					backgroundColor: tokens.color.line,
					zIndex: 0
				}}
			/>
			{bubbles.map(bubble => (
				<ThreadBubble key={bubble.id} bubble={bubble} defaultOpen={bubbles.length === 1} />
			))}
		</Box>
	);
}

function ThreadBubble({ bubble, defaultOpen }: { bubble: ThreadBubbleData; defaultOpen: boolean }) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const isOut = bubble.direction === 'out';

	return (
		<Box sx={{ position: 'relative', zIndex: 1, display: 'flex', gap: 1.75, alignItems: 'flex-start' }}>
			{/* Avatar node sitting on the spine. */}
			<Box sx={{ flexShrink: 0 }}>
				{isOut ? (
					<Box
						component='span'
						sx={{
							width: 40,
							height: 40,
							borderRadius: `${tokens.radius.md}px`,
							backgroundColor: c.accent[500],
							color: c.accent.fg,
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							border: `3px solid ${c.paper}`
						}}
					>
						<AppIcon name='send' size='medium' />
					</Box>
				) : (
					<Box
						component='span'
						sx={{
							display: 'inline-block',
							border: `3px solid ${c.paper}`,
							borderRadius: `${tokens.radius.md}px`
						}}
					>
						<Avatar name={bubble.who} size={34} />
					</Box>
				)}
			</Box>

			{/* Bubble — a collapsible MUI Accordion (DS chrome lives in theme.utils.ts); collapsed by
			    default, expanded when it's the only message in the thread. The `--out` class tints
			    our own replies with the accent palette. */}
			<Accordion
				defaultExpanded={defaultOpen}
				className={isOut ? 'OppThreadBubble OppThreadBubble--out' : 'OppThreadBubble'}
			>
				<AccordionSummary expandIcon={<AppIcon name='chevron-down' size='small' />}>
					<Box
						component='span'
						sx={{ fontSize: 13, fontWeight: 'bold', color: isOut ? c.accent[700] : c.ink1 }}
					>
						{bubble.who}
					</Box>
					{bubble.version !== null && (
						<Box
							component='span'
							sx={{
								fontSize: 11,
								fontWeight: 'bold',
								color: c.accent[700],
								backgroundColor: c.surface,
								border: `1px solid ${c.accent[300]}`,
								px: 0.75,
								py: 0.5,
								borderRadius: `${tokens.radius.sm}px`,
								fontVariantNumeric: 'tabular-nums'
							}}
						>
							v{bubble.version} · verzonden
						</Box>
					)}
					{bubble.isCheckIn && (
						<Box
							component='span'
							sx={{
								fontSize: 11,
								fontWeight: 'bold',
								color: c.accent[700],
								backgroundColor: c.accent[50],
								border: `1px solid ${c.accent[300]}`,
								px: 0.75,
								py: 0.5,
								borderRadius: `${tokens.radius.sm}px`,
								display: 'inline-flex',
								alignItems: 'center',
								gap: 0.5
							}}
						>
							<AppIcon name='sparkles' size='small' /> Automatische follow-up
						</Box>
					)}
					{bubble.hasReplyBadge && (
						<Box
							component='span'
							sx={{
								fontSize: 11,
								fontWeight: 'bold',
								color: c.won[700],
								backgroundColor: c.won[50],
								border: `1px solid ${c.won[500]}`,
								px: 0.75,
								py: 0.5,
								borderRadius: `${tokens.radius.sm}px`,
								display: 'inline-flex',
								alignItems: 'center',
								gap: 0.5
							}}
						>
							<AppIcon name='corner-up-left' size='small' /> Antwoord
						</Box>
					)}
					{bubble.wasCloser && (
						<Box
							component='span'
							title='Offertum herkende dit als een afronding en stelde geen concept op.'
							sx={{
								fontSize: 11,
								fontWeight: 'bold',
								color: c.ink3,
								backgroundColor: c.surface,
								border: `1px solid ${c.lineStrong}`,
								px: 0.75,
								py: 0.5,
								borderRadius: `${tokens.radius.sm}px`
							}}
						>
							Afsluiter
						</Box>
					)}
					<Box
						component='span'
						sx={{ ml: 'auto', mr: 1, fontSize: 12, color: c.ink4, fontVariantNumeric: 'tabular-nums' }}
					>
						{toReadableDateTime(bubble.timestamp)}
					</Box>
				</AccordionSummary>
				<AccordionDetails>
					{bubble.subject && (
						<Box sx={{ pt: 1.25, px: 2, fontSize: 14, fontWeight: 'bold', color: c.ink1 }}>
							{bubble.subject}
						</Box>
					)}

					<Box
						component='pre'
						sx={{
							pt: 1.5,
							px: 2,
							pb: 1.75,
							m: 0,
							fontFamily: tokens.font.sans,
							fontSize: 14,
							lineHeight: 1.55,
							color: c.ink2,
							whiteSpace: 'pre-wrap'
						}}
					>
						{bubble.body || '(geen tekstuele inhoud)'}
					</Box>

					{bubble.attachmentsCount > 0 && (
						<Box
							sx={{
								px: 2,
								pb: 1.5,
								display: 'inline-flex',
								alignItems: 'center',
								gap: 0.75,
								color: c.ink4,
								fontSize: 12
							}}
						>
							<AppIcon name='paperclip' size='small' /> {bubble.attachmentsCount} bijlage
							{bubble.attachmentsCount === 1 ? '' : 'n'}
						</Box>
					)}
				</AccordionDetails>
			</Accordion>
		</Box>
	);
}
// Conversation message count for the thread heading — original email + each sent reply.
// (Inbound customer replies render as bubbles too but the design's heading counts the
// original + our sent versions; matching that keeps the "Gesprek" count stable per reply round.)
export function conversationMessageCount(sentDrafts: ReplyDraft[], customerReplies: CustomerReplyEntry[]): number {
	const sentCount = sentDrafts.filter(d => d.status === 'sent' && d.sentAt !== null).length;
	return 1 + sentCount + customerReplies.length;
}
