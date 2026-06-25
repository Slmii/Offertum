import { AppIcon } from '@/components/AppIcon.component';
import { Body, BodySmall } from '@/components/Text.component';
import {
	notificationsListQueryOptions,
	useMarkAllNotificationsRead,
	useMarkNotificationRead
} from '@/lib/queries/notifications.queries';
import { toReadableTimestamp } from '@/lib/utils/date.utils';
import { notificationKindStyle } from '@/lib/utils/notification.utils';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import type { AppNotification } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

type NotificationFilter = 'all' | 'unread';

export function NotificationBell() {
	const { data } = useSuspenseQuery(notificationsListQueryOptions);
	const markRead = useMarkNotificationRead();
	const markAllRead = useMarkAllNotificationsRead();

	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const [filter, setFilter] = useState<NotificationFilter>('all');

	const notifications = data.notifications;
	const unreadCount = data.unreadCount;
	const visible = filter === 'unread' ? notifications.filter(n => !n.readAt) : notifications;

	const onOpen = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
	const onClose = () => setAnchorEl(null);

	return (
		<>
			<IconButton aria-label='Notificaties' onClick={onOpen} size='small' sx={{ color: 'text.primary' }}>
				<Badge badgeContent={unreadCount} color='primary' overlap='circular'>
					<AppIcon name='bell' size='medium' filled={unreadCount > 0} />
				</Badge>
			</IconButton>
			<Popover
				open={Boolean(anchorEl)}
				anchorEl={anchorEl}
				onClose={onClose}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
				slotProps={{
					paper: {
						sx: {
							width: 380,
							maxHeight: 'min(640px, calc(100vh - 100px))',
							display: 'flex',
							flexDirection: 'column'
						}
					}
				}}
			>
				<Stack
					direction='row'
					sx={{ p: 1.5, pb: 1, alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}
				>
					<Body fontWeight='medium'>Meldingen</Body>
					{unreadCount > 0 && (
						<Button size='small' variant='text' onClick={() => markAllRead.mutate()}>
							Markeer alles gelezen
						</Button>
					)}
				</Stack>

				<Stack direction='row' useFlexGap spacing={0.5} sx={{ px: 1.5, pb: 1, flexShrink: 0 }}>
					<FilterTab
						label='Alles'
						count={notifications.length}
						active={filter === 'all'}
						onClick={() => setFilter('all')}
					/>
					<FilterTab
						label='Ongelezen'
						count={unreadCount}
						active={filter === 'unread'}
						accent
						onClick={() => setFilter('unread')}
					/>
				</Stack>
				<Divider />

				<Box sx={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
					{visible.length === 0 ? (
						<EmptyState filter={filter} />
					) : (
						visible.map(n => (
							<NotificationRow
								key={n.id}
								notification={n}
								onActivate={() => {
									if (!n.readAt) {
										markRead.mutate(n.id);
									}
									onClose();
								}}
							/>
						))
					)}
				</Box>

				<Stack
					direction='row'
					sx={{
						p: 1.5,
						alignItems: 'center',
						justifyContent: 'space-between',
						backgroundColor: 'background.default',
						borderTop: 1,
						borderColor: 'divider',
						flexShrink: 0
					}}
				>
					<Button size='small' variant='text' component={Link} to='/settings/notifications' onClick={onClose}>
						Alle meldingen bekijken
					</Button>
					<Button
						size='small'
						variant='text'
						color='inherit'
						component={Link}
						to='/settings/notifications'
						onClick={onClose}
						startIcon={<AppIcon name='settings' size='small' />}
					>
						Voorkeuren
					</Button>
				</Stack>
			</Popover>
		</>
	);
}

function EmptyState({ filter }: { filter: NotificationFilter }) {
	const { tokens } = useTheme();
	return (
		<Box sx={{ p: 4, textAlign: 'center' }}>
			<Box
				sx={{
					width: 40,
					height: 40,
					mx: 'auto',
					mb: 1.25,
					borderRadius: '50%',
					backgroundColor: tokens.color.paper2,
					color: tokens.color.ink4,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center'
				}}
			>
				<AppIcon name='check' size='medium' />
			</Box>
			<BodySmall fontWeight='medium' sx={{ display: 'block' }}>
				{filter === 'unread' ? 'Geen ongelezen meldingen.' : 'Nog geen notificaties.'}
			</BodySmall>
			<BodySmall color='textSecondary' sx={{ display: 'block', mt: 0.25 }}>
				Je bent helemaal bij.
			</BodySmall>
		</Box>
	);
}

function FilterTab({
	label,
	count,
	active,
	accent,
	onClick
}: {
	label: string;
	count: number;
	active: boolean;
	accent?: boolean;
	onClick: () => void;
}) {
	const { tokens } = useTheme();
	return (
		<ButtonBase
			onClick={onClick}
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 0.75,
				px: 1.25,
				py: 0.75,
				border: 'none',
				borderRadius: `${tokens.radius.sm}px`,
				backgroundColor: active ? tokens.color.paper3 : 'transparent',
				color: active ? 'text.primary' : 'text.secondary',
				fontFamily: tokens.font.sans,
				fontSize: 12,
				fontWeight: active ? 'bold' : 'medium',
				cursor: 'pointer',
				'&:hover': { backgroundColor: active ? tokens.color.paper3 : tokens.color.paper2 }
			}}
		>
			{label}
			{count > 0 && (
				<Box
					component='span'
					sx={{
						px: 0.75,
						minWidth: 18,
						height: 16,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						borderRadius: '8px',
						fontSize: 10,
						fontWeight: 'bold',
						backgroundColor: accent ? tokens.color.accent[500] : tokens.color.paper3,
						color: accent ? tokens.color.accent.fg : tokens.color.ink3
					}}
				>
					{count}
				</Box>
			)}
		</ButtonBase>
	);
}

function NotificationRow({ notification, onActivate }: { notification: AppNotification; onActivate: () => void }) {
	const { tokens } = useTheme();
	const isUnread = !notification.readAt;
	const kind = notificationKindStyle(notification.eventType);

	const content = (
		<Stack direction='row' useFlexGap spacing={1.5} sx={{ alignItems: 'flex-start' }}>
			{/* Unread dot — leading, vertically centered against the icon. */}
			<Box
				aria-hidden='true'
				sx={{
					width: 6,
					height: 6,
					mt: 1.75,
					borderRadius: '50%',
					backgroundColor: isUnread ? tokens.color.accent[500] : 'transparent',
					flexShrink: 0
				}}
			/>
			{/* Per-kind colored icon avatar. */}
			<Box
				sx={{
					width: 32,
					height: 32,
					mt: 0.25,
					borderRadius: `${tokens.radius.sm}px`,
					backgroundColor: kind.bg(tokens),
					color: kind.fg(tokens),
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					flexShrink: 0
				}}
			>
				<AppIcon name={kind.icon} size='small' />
			</Box>
			{/* Title + clamped body + timestamp. */}
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Stack
					direction='row'
					useFlexGap
					spacing={1}
					sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}
				>
					<BodySmall
						fontWeight={isUnread ? 'bold' : 'medium'}
						sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
					>
						{notification.title}
					</BodySmall>
					<BodySmall color='text.disabled' sx={{ flexShrink: 0 }}>
						{toReadableTimestamp(notification.createdAt)}
					</BodySmall>
				</Stack>
				<BodySmall
					color='textSecondary'
					sx={{
						display: '-webkit-box',
						WebkitLineClamp: 2,
						WebkitBoxOrient: 'vertical',
						overflow: 'hidden',
						lineHeight: 1.5
					}}
				>
					{notification.body}
				</BodySmall>
			</Box>
		</Stack>
	);

	const rowSx = {
		p: 1.5,
		width: '100%',
		display: 'block',
		textAlign: 'left',
		borderBottom: 1,
		borderColor: 'divider',
		backgroundColor: isUnread ? tokens.color.paper2 : 'transparent',
		'&:hover': { backgroundColor: tokens.color.paper2 }
	} as const;

	if (notification.link) {
		return (
			<Box
				component={Link}
				to={notification.link as '/'}
				onClick={onActivate}
				sx={{ ...rowSx, color: 'inherit', textDecoration: 'none' }}
			>
				{content}
			</Box>
		);
	}

	// ButtonBase = real <button>: keyboard-focusable + Enter/Space activation for free,
	// unlike a click-handled div.
	return (
		<ButtonBase onClick={onActivate} sx={rowSx}>
			{content}
		</ButtonBase>
	);
}
