import {
	notificationsListQueryOptions,
	useMarkAllNotificationsRead,
	useMarkNotificationRead
} from '@/lib/queries/notifications.queries';
import { toReadableTimestamp } from '@/lib/utils/date.utils';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { AppNotification } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

export function NotificationBell() {
	const { data } = useSuspenseQuery(notificationsListQueryOptions);
	const markRead = useMarkNotificationRead();
	const markAllRead = useMarkAllNotificationsRead();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

	const notifications = data.notifications;
	const unreadCount = data.unreadCount;

	const onOpen = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
	const onClose = () => setAnchorEl(null);

	return (
		<>
			<IconButton aria-label='Notificaties' onClick={onOpen} size='small' sx={{ color: 'text.primary' }}>
				<Badge badgeContent={unreadCount} color='primary' overlap='circular'>
					<BellGlyph />
				</Badge>
			</IconButton>
			<Popover
				open={Boolean(anchorEl)}
				anchorEl={anchorEl}
				onClose={onClose}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
				slotProps={{ paper: { sx: { width: 360, maxHeight: 480 } } }}
			>
				<Stack direction='row' sx={{ p: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
					<Typography sx={{ fontWeight: 500 }}>Notificaties</Typography>
					{unreadCount > 0 && (
						<Button size='small' variant='text' onClick={() => markAllRead.mutate()}>
							Markeer alles gelezen
						</Button>
					)}
				</Stack>
				<Divider />
				{notifications.length === 0 ? (
					<Box sx={{ p: 3 }}>
						<Typography variant='body2' color='text.secondary' sx={{ textAlign: 'center' }}>
							Nog geen notificaties.
						</Typography>
					</Box>
				) : (
					<Stack divider={<Divider />}>
						{notifications.map(n => (
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
						))}
					</Stack>
				)}
				<Divider />
				<Box sx={{ p: 1.5, textAlign: 'center' }}>
					<Button size='small' component={Link} to='/settings/notifications' onClick={onClose}>
						Notificatie-instellingen
					</Button>
				</Box>
			</Popover>
		</>
	);
}

function NotificationRow({ notification, onActivate }: { notification: AppNotification; onActivate: () => void }) {
	const content = (
		<Stack spacing={0.5}>
			<Typography variant='body2' sx={{ fontWeight: notification.readAt ? 400 : 600 }}>
				{notification.title}
			</Typography>
			<Typography variant='caption' color='text.secondary'>
				{notification.body}
			</Typography>
			<Typography variant='caption' color='text.disabled'>
				{toReadableTimestamp(notification.createdAt)}
			</Typography>
		</Stack>
	);

	if (notification.link) {
		return (
			<Box
				component={Link}
				to={notification.link as '/'}
				onClick={onActivate}
				sx={{
					p: 1.5,
					backgroundColor: notification.readAt ? 'transparent' : 'rgba(26, 35, 126, 0.04)',
					color: 'inherit',
					textDecoration: 'none',
					display: 'block',
					'&:hover': { backgroundColor: 'action.hover' }
				}}
			>
				{content}
			</Box>
		);
	}

	return (
		<Box
			onClick={onActivate}
			sx={{
				p: 1.5,
				backgroundColor: notification.readAt ? 'transparent' : 'rgba(26, 35, 126, 0.04)',
				cursor: 'pointer',
				'&:hover': { backgroundColor: 'action.hover' }
			}}
		>
			{content}
		</Box>
	);
}

function BellGlyph() {
	return (
		<svg
			xmlns='http://www.w3.org/2000/svg'
			width='20'
			height='20'
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.5'
			strokeLinecap='round'
			strokeLinejoin='round'
			aria-hidden
		>
			<path d='M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' />
			<path d='M10.3 21a1.94 1.94 0 0 0 3.4 0' />
		</svg>
	);
}
