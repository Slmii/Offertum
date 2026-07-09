import { AppIcon } from '@/components/AppIcon.component';
import { Segmented } from '@/components/Segmented.component';
import { H1 } from '@/components/Text.component';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import { useState, type MouseEvent } from 'react';
import { VIEW_OPTIONS, type CalendarView } from './calendar-views';

const MONTHS_NL = [
	'januari',
	'februari',
	'maart',
	'april',
	'mei',
	'juni',
	'juli',
	'augustus',
	'september',
	'oktober',
	'november',
	'december'
];

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Calendar page toolbar (the design's `CalendarToolbar`) — title + the period nav (month/year
 * picker + connected prev/next pair + Vandaag) on the left, the Maand/Week/Agenda switcher +
 * subscribe button on the right. Navigation/jumps are driven by the parent via FullCalendar's API;
 * this component is presentational. `currentDate` is the calendar's current range start (null until
 * FullCalendar mounts on the client and reports it via `datesSet`).
 */
export function CalendarToolbar({
	currentDate,
	view,
	onPrev,
	onNext,
	onToday,
	onJump,
	onChangeView,
	onSubscribe
}: {
	currentDate: Date | null;
	view: CalendarView;
	onPrev: () => void;
	onNext: () => void;
	onToday: () => void;
	onJump: (date: Date) => void;
	onChangeView: (view: CalendarView) => void;
	onSubscribe: () => void;
}) {
	return (
		<Stack direction='row' useFlexGap spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1.5 }}>
			<Stack
				direction='row'
				useFlexGap
				spacing={2}
				sx={{ alignItems: 'center', flex: 1, minWidth: 240, flexWrap: 'wrap' }}
			>
				<H1 sx={{ m: 0 }}>Kalender</H1>
				<PeriodNav
					currentDate={currentDate}
					onPrev={onPrev}
					onNext={onNext}
					onToday={onToday}
					onJump={onJump}
				/>
			</Stack>

			<Stack direction='row' useFlexGap spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
				<Segmented value={view} options={VIEW_OPTIONS} onChange={onChangeView} ariaLabel='Weergave' />
				<Button variant='contained' startIcon={<AppIcon name='calendar' size='small' />} onClick={onSubscribe}>
					Abonneer in je agenda
				</Button>
			</Stack>
		</Stack>
	);
}

/**
 * The design's `PeriodNav`: a clickable "{Maand} {Jaar} ⌄" label that opens a month/year picker,
 * a connected prev/next arrow pair, and a Vandaag button. The month picker jumps the calendar to
 * the first of the chosen month via `onJump` (FullCalendar `gotoDate`), staying in the current view.
 */
function PeriodNav({
	currentDate,
	onPrev,
	onNext,
	onToday,
	onJump
}: {
	currentDate: Date | null;
	onPrev: () => void;
	onNext: () => void;
	onToday: () => void;
	onJump: (date: Date) => void;
}) {
	const { tokens } = useTheme();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const [pickYear, setPickYear] = useState(() => (currentDate ?? new Date()).getFullYear());
	const isOpen = Boolean(anchorEl);

	const month = currentDate?.getMonth() ?? null;
	const year = currentDate?.getFullYear() ?? null;
	const label = currentDate ? `${capitalize(MONTHS_NL[currentDate.getMonth()]!)} ${currentDate.getFullYear()}` : '';

	const openPicker = (event: MouseEvent<HTMLElement>): void => {
		setPickYear(year ?? new Date().getFullYear());
		setAnchorEl(event.currentTarget);
	};
	const closePicker = (): void => setAnchorEl(null);
	const pickMonth = (index: number): void => {
		onJump(new Date(pickYear, index, 1));
		closePicker();
	};

	const arrowSx = {
		width: 30,
		height: 30,
		borderRadius: 0,
		color: tokens.color.ink2,
		'&:hover': { backgroundColor: tokens.color.paper2 }
	} as const;
	const yearStepSx = {
		width: 28,
		height: 28,
		borderRadius: `${tokens.radius.md}px`,
		border: `1px solid ${tokens.color.line}`,
		color: tokens.color.ink2,
		'&:hover': { backgroundColor: tokens.color.paper2 }
	} as const;

	return (
		<Stack direction='row' useFlexGap spacing={1.25} sx={{ alignItems: 'center' }}>
			{/* Month + year — opens the picker */}
			<ButtonBase
				onClick={openPicker}
				aria-haspopup='dialog'
				aria-expanded={isOpen}
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 0.75,
					height: 34,
					pl: 0.5,
					pr: 1,
					borderRadius: `${tokens.radius.md}px`,
					backgroundColor: isOpen ? tokens.color.paper3 : 'transparent',
					fontFamily: tokens.font.display,
					fontSize: 22,
					fontWeight: 'medium',
					color: tokens.color.ink1,
					letterSpacing: '-0.01em',
					'&:hover': { backgroundColor: isOpen ? tokens.color.paper3 : tokens.color.paper2 }
				}}
			>
				<Box
					component='span'
					aria-live='polite'
					className='tabular'
					sx={{ whiteSpace: 'nowrap', minWidth: 175 }}
				>
					{label}
				</Box>
				<Box component='span' sx={{ display: 'inline-flex', color: tokens.color.ink4 }}>
					<AppIcon name='chevron-down' size='small' />
				</Box>
			</ButtonBase>

			{/* Connected prev/next pair */}
			<Box
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					backgroundColor: tokens.color.surface,
					border: `1px solid ${tokens.color.lineStrong}`,
					borderRadius: `${tokens.radius.md}px`,
					overflow: 'hidden'
				}}
			>
				<IconButton aria-label='Vorige maand' onClick={onPrev} sx={arrowSx}>
					<AppIcon name='chevron-left' size='small' />
				</IconButton>
				<Box sx={{ width: '1px', height: 18, backgroundColor: tokens.color.line }} />
				<IconButton aria-label='Volgende maand' onClick={onNext} sx={arrowSx}>
					<AppIcon name='chevron-right' size='small' />
				</IconButton>
			</Box>

			<ButtonBase
				onClick={onToday}
				sx={{
					height: 30,
					px: 1.5,
					borderRadius: `${tokens.radius.md}px`,
					border: `1px solid ${tokens.color.lineStrong}`,
					backgroundColor: tokens.color.surface,
					color: tokens.color.ink2,
					fontFamily: tokens.font.sans,
					fontSize: 13,
					fontWeight: 'medium',
					'&:hover': { backgroundColor: tokens.color.paper2 }
				}}
			>
				Vandaag
			</ButtonBase>

			<Popover
				open={isOpen}
				anchorEl={anchorEl}
				onClose={closePicker}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
				transformOrigin={{ vertical: 'top', horizontal: 'left' }}
				slotProps={{
					paper: {
						sx: {
							mt: 0.5,
							width: 264,
							backgroundColor: tokens.color.surface,
							border: `1px solid ${tokens.color.line}`,
							borderRadius: `${tokens.radius.md}px`,
							boxShadow: tokens.shadow[2]
						}
					}
				}}
			>
				<Box sx={{ p: 1.5 }}>
					{/* Year stepper */}
					<Stack direction='row' sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
						<IconButton aria-label='Vorig jaar' onClick={() => setPickYear(y => y - 1)} sx={yearStepSx}>
							<AppIcon name='chevron-left' size='small' />
						</IconButton>
						<Box
							className='tabular'
							sx={{
								fontFamily: tokens.font.display,
								fontSize: 17,
								fontWeight: 'medium',
								color: tokens.color.ink1
							}}
						>
							{pickYear}
						</Box>
						<IconButton aria-label='Volgend jaar' onClick={() => setPickYear(y => y + 1)} sx={yearStepSx}>
							<AppIcon name='chevron-right' size='small' />
						</IconButton>
					</Stack>

					{/* Month grid */}
					<Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>
						{MONTHS_NL.map((name, index) => {
							const isActive = index === month && pickYear === year;
							return (
								<ButtonBase
									key={name}
									onClick={() => pickMonth(index)}
									sx={{
										height: 34,
										borderRadius: `${tokens.radius.md}px`,
										backgroundColor: isActive ? tokens.color.accent[500] : 'transparent',
										color: isActive ? tokens.color.accent.fg : tokens.color.ink2,
										fontFamily: tokens.font.sans,
										fontSize: 13,
										fontWeight: isActive ? 'bold' : 'medium',
										'&:hover': {
											backgroundColor: isActive ? tokens.color.accent[500] : tokens.color.paper3
										}
									}}
								>
									{capitalize(name.slice(0, 3))}
								</ButtonBase>
							);
						})}
					</Box>
				</Box>
			</Popover>
		</Stack>
	);
}
