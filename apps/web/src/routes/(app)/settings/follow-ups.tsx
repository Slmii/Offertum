import { AppIcon } from '@/components/AppIcon.component';
import { StandaloneField } from '@/components/Form/Field/Field.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SectionError } from '@/components/SectionError.component';
import { BodySmall, Overline } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import { followUpSettingsQueryOptions, useUpdateFollowUpSettings } from '@/lib/queries/follow-up-settings.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import type { Theme } from '@mui/material/styles';
import {
	FOLLOW_UP_COLD_AFTER_DAYS_MAX,
	FOLLOW_UP_COLD_AFTER_DAYS_MIN,
	FOLLOW_UP_MAX_COUNT_MAX,
	FOLLOW_UP_MAX_COUNT_MIN,
	pluralize,
	type UpdateFollowUpSettingsInput
} from '@offertum/shared';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';

/**
 * Owner-only follow-up policy page — the "Postvak" (inbox) design. A single card holds a live
 * summary line, the cadence + attempt sliders, and a simulated mail thread (the reply plus each
 * concept follow-up) that recomposes as the owner tunes cadence/count — each follow-up bubble
 * expands/collapses one at a time (direction-aware stagger). A separate card carries the auto-cold
 * window. Every change persists immediately (sliders on release, the cold field on blur); failures
 * toast and revert. Saves are serialized in the mutation hook so they can't resolve out of order.
 */
export const Route = createFileRoute('/(app)/settings/follow-ups')({
	beforeLoad: async ({ context }) => {
		const me = await context.queryClient.ensureQueryData(myMembershipQueryOptions);
		if (me.role !== 'OWNER') {
			throw redirect({ to: '/' });
		}
	},
	loader: ({ context }) => context.queryClient.ensureQueryData(followUpSettingsQueryOptions),
	component: FollowUpsSettingsPage,
	errorComponent: SectionError
});

const CADENCE_MIN = 1;
const CADENCE_MAX = 14;
const DEFAULT_MAX_COUNT = 2;
/** Per-bubble stagger between successive add/remove animations (ms). */
const THREAD_STAGGER_MS = 70;

const REPLY_BODY = 'Beste heer Bakker, bijgevoegd vindt u onze offerte. Ik hoor graag of het aansluit bij uw wensen.';
const FIRST_CHECKIN_BODY =
	'Beste heer Bakker, ik wilde even checken of onze offerte is aangekomen en of u nog vragen heeft.';
const LATER_CHECKIN_BODY =
	'Beste heer Bakker, mocht de offerte nog spelen — ik denk graag mee. Laat gerust weten hoe u erover denkt.';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const single = (value: number | number[]) => (Array.isArray(value) ? (value[0] ?? 0) : value);

/** Shared accent-themed slider styling (6px gradient track, 22px surface thumb). */
const sliderSx = (theme: Theme) => ({
	height: 6,
	py: 1.25,
	'& .MuiSlider-rail': {
		opacity: 1,
		height: 6,
		borderRadius: 999,
		backgroundColor: theme.tokens.color.lineStrong
	},
	'& .MuiSlider-track': {
		border: 'none',
		height: 6,
		borderRadius: 999,
		background: `linear-gradient(to right, ${theme.tokens.color.accent[700]}, ${theme.tokens.color.accent[500]})`
	},
	'& .MuiSlider-thumb': {
		width: 22,
		height: 22,
		backgroundColor: theme.tokens.color.surface,
		border: `2px solid ${theme.tokens.color.accent[500]}`,
		boxShadow: theme.tokens.shadow[1],
		'&:hover, &.Mui-focusVisible': { boxShadow: theme.tokens.shadow[1] },
		'&.Mui-active': { borderColor: theme.tokens.color.accent[700] }
	}
});

function FollowUpsSettingsPage() {
	const { data } = useSuspenseQuery(followUpSettingsQueryOptions);
	const update = useUpdateFollowUpSettings();
	const toast = useToast();
	const queryClient = useQueryClient();

	const [seed, setSeed] = useState(data);
	const [cadence, setCadence] = useState(data.cadenceDays);
	const [maxCount, setMaxCount] = useState(data.maxCount);
	const [coldAfter, setColdAfter] = useState(data.coldAfterDays);
	// Track the previous count so add vs remove can stagger in the natural direction.
	const [prevMaxCount, setPrevMaxCount] = useState(data.maxCount);
	const [savedFlash, setSavedFlash] = useState(false);

	// Re-seed local state when the server config changes (e.g. after a save refetch).
	if (data !== seed) {
		setSeed(data);
		setCadence(data.cadenceDays);
		setMaxCount(data.maxCount);
		setColdAfter(data.coldAfterDays);
		setPrevMaxCount(data.maxCount);
	}

	const disabled = maxCount === 0;
	const removing = maxCount < prevMaxCount;
	if (maxCount !== prevMaxCount) {
		setPrevMaxCount(maxCount);
	}

	// Adding → later bubbles wait longer (open in order). Removing → higher-index bubbles go first
	// (collapse bottom-up). Static bubbles never re-run since their `active` doesn't change.
	const slotDelay = (index: number) => (removing ? FOLLOW_UP_MAX_COUNT_MAX - index : index - 1) * THREAD_STAGGER_MS;

	const persist = (next: UpdateFollowUpSettingsInput) => {
		update.mutate(next, {
			onSuccess: () => {
				setSavedFlash(true);
				window.setTimeout(() => setSavedFlash(false), 2000);
			},
			onError: error => {
				toast.error('Opslaan mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.');
				// Revert to the freshest server-known config on failure.
				const latest = queryClient.getQueryData(followUpSettingsQueryOptions.queryKey) ?? data;
				setCadence(latest.cadenceDays);
				setMaxCount(latest.maxCount);
				setColdAfter(latest.coldAfterDays);
			}
		});
	};

	const commitCadence = (value: number) => {
		setCadence(value);
		if (value === data.cadenceDays) {
			return;
		}
		persist({ cadenceDays: value, maxCount, coldAfterDays: coldAfter });
	};
	const commitMaxCount = (value: number) => {
		setMaxCount(value);
		if (value === data.maxCount) {
			return;
		}
		persist({ cadenceDays: cadence, maxCount: value, coldAfterDays: coldAfter });
	};
	const commitColdAfter = () => {
		if (coldAfter === data.coldAfterDays) {
			return;
		}
		persist({ cadenceDays: cadence, maxCount, coldAfterDays: coldAfter });
	};
	const toggleDisabled = () => commitMaxCount(disabled ? DEFAULT_MAX_COUNT : 0);

	return (
		<Stack useFlexGap spacing={2.5}>
			<PageHeader
				title='Automatische follow-ups'
				caption="Offertum houdt aanvragen waarop je antwoordde in de gaten. Blijft de klant stil, dan schrijft Offertum een vriendelijke check-in en zet 'm klaar — jij leest 'm na en verstuurt."
				disableMargin
			/>

			<Paper variant='outlined' sx={{ p: 0, overflow: 'hidden' }}>
				{/* Summary line */}
				<Box
					sx={theme => ({
						py: 2.5,
						px: 3,
						transition: `background-color ${theme.tokens.motion.durBase}ms ${theme.tokens.motion.easeOut}`,
						backgroundColor: disabled ? theme.tokens.color.paper2 : theme.tokens.color.accent[50],
						borderBottom: `1px solid ${disabled ? theme.tokens.color.line : theme.tokens.color.accent[300]}`
					})}
				>
					{disabled ? (
						<Stack direction='row' useFlexGap spacing={1.5} sx={{ alignItems: 'center' }}>
							<Box sx={theme => ({ display: 'inline-flex', color: theme.tokens.color.ink3 })}>
								<AppIcon name='pause' size='medium' />
							</Box>
							<BodySmall fontWeight='medium' sx={{ fontSize: 15 }}>
								Offertum stelt geen follow-ups voor.
							</BodySmall>
						</Stack>
					) : (
						<Box
							sx={theme => ({
								fontFamily: theme.tokens.font.display,
								fontWeight: 500,
								fontSize: 20,
								lineHeight: 1.4,
								color: theme.tokens.color.ink1,
								maxWidth: 720
							})}
						>
							Offertum stelt maximaal{' '}
							<Emphasis>
								<PopNumber value={maxCount} /> {pluralize(maxCount, 'follow-up', 'follow-ups')}
							</Emphasis>{' '}
							op, telkens na{' '}
							<Emphasis>
								<PopNumber value={cadence} /> {pluralize(cadence, 'dag', 'dagen')}
							</Emphasis>{' '}
							stilte — daarna is het aan jou.
						</Box>
					)}
				</Box>

				{/* Controls */}
				<Stack
					useFlexGap
					sx={theme => ({ p: 3, gap: 3.5, borderBottom: `1px solid ${theme.tokens.color.line}` })}
				>
					<CadenceSlider
						value={cadence}
						disabled={disabled}
						onLiveChange={setCadence}
						onCommit={commitCadence}
					/>
					<MaxCountSlider value={maxCount} onLiveChange={setMaxCount} onCommit={commitMaxCount} />
				</Stack>

				{/* Simulated thread */}
				<Box sx={theme => ({ p: 3, backgroundColor: theme.tokens.color.paper2 })}>
					<Overline color='textSecondary' sx={{ display: 'block', mb: 1.75 }}>
						Voorbeeld — aanvraag van Bakker Renovatie
					</Overline>
					<Box>
						<Box sx={{ pb: 1.5 }}>
							<MailBubble
								avatarInit='Y'
								author='Jij'
								day={0}
								sent
								subject='Re: offerteaanvraag badkamer'
								body={REPLY_BODY}
							/>
						</Box>
						{Array.from({ length: FOLLOW_UP_MAX_COUNT_MAX }, (_, i) => i + 1).map(index => (
							<ThreadSlot
								key={index}
								active={index <= maxCount}
								delayMs={slotDelay(index)}
								maxHeight={220}
							>
								<Box sx={{ pb: 1.5 }}>
									<MailBubble
										avatarInit='O'
										author='Offertum'
										day={index * cadence}
										concept
										subject={`Vriendelijke herinnering (${index}/${Math.max(maxCount, index)})`}
										body={index === 1 ? FIRST_CHECKIN_BODY : LATER_CHECKIN_BODY}
									/>
								</Box>
							</ThreadSlot>
						))}
						<ThreadSlot
							active={!disabled}
							delayMs={removing ? 0 : maxCount * THREAD_STAGGER_MS}
							maxHeight={48}
						>
							<Stack
								direction='row'
								useFlexGap
								spacing={1}
								sx={theme => ({
									alignItems: 'center',
									justifyContent: 'center',
									pt: 1.25,
									color: theme.tokens.color.ink4
								})}
							>
								<Box
									sx={theme => ({
										width: 24,
										height: '1px',
										backgroundColor: theme.tokens.color.lineStrong
									})}
								/>
								<AppIcon name='flag' size='small' />
								<BodySmall color='textSecondary' sx={{ fontSize: 12 }}>
									Na dag {cadence * Math.max(maxCount, 1)} stopt Offertum
								</BodySmall>
								<Box
									sx={theme => ({
										width: 24,
										height: '1px',
										backgroundColor: theme.tokens.color.lineStrong
									})}
								/>
							</Stack>
						</ThreadSlot>
					</Box>
				</Box>
			</Paper>

			{/* Auto-cold window */}
			<Paper variant='outlined' sx={{ p: 0, overflow: 'hidden' }}>
				<Box sx={theme => ({ py: 2.5, px: 3, borderBottom: `1px solid ${theme.tokens.color.line}` })}>
					<BodySmall fontWeight='medium' sx={{ display: 'block', fontSize: 15 }}>
						Automatisch op koud
					</BodySmall>
					<BodySmall color='textSecondary' sx={{ display: 'block', mt: 0.5, fontSize: 12 }}>
						Na deze stilteperiode — alle check-ins verstuurd, nog geen reactie — zet Offertum de aanvraag
						zelf op Koud.
					</BodySmall>
				</Box>
				<Stack direction='row' useFlexGap spacing={1.5} sx={{ p: 3, alignItems: 'center' }}>
					<Box sx={{ width: 140 }}>
						<StandaloneField
							name='cold-after-days'
							type='number'
							value={String(coldAfter)}
							startElement={<AppIcon name='snowflake' size='small' />}
							onChange={event => {
								const parsed = Number(event.target.value);
								if (Number.isFinite(parsed) && event.target.value !== '') {
									setColdAfter(
										clamp(
											Math.round(parsed),
											FOLLOW_UP_COLD_AFTER_DAYS_MIN,
											FOLLOW_UP_COLD_AFTER_DAYS_MAX
										)
									);
								}
							}}
							onBlur={commitColdAfter}
							fullWidth
						/>
					</Box>
					<BodySmall color='textSecondary'>
						{coldAfter === 0 ? (
							<>
								<Box component='strong' sx={{ color: 'text.primary' }}>
									0
								</Box>{' '}
								— automatisch op koud staat uit; je houdt aanvragen zelf bij.
							</>
						) : (
							<>dagen na de laatste verzending.</>
						)}
					</BodySmall>
				</Stack>
			</Paper>

			<DisableZone disabled={disabled} onToggle={toggleDisabled} />

			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 2,
					py: 1,
					minHeight: 24
				}}
			>
				<BodySmall color='textSecondary' sx={{ fontSize: 12 }}>
					Wijzigingen worden direct opgeslagen en gelden voor nieuwe stilte-periodes.
				</BodySmall>
				{update.isPending ? (
					<Stack direction='row' useFlexGap spacing={0.75} sx={{ alignItems: 'center', flexShrink: 0 }}>
						<CircularProgress size={12} color='inherit' />
						<BodySmall color='textSecondary' sx={{ fontSize: 12 }}>
							Opslaan…
						</BodySmall>
					</Stack>
				) : savedFlash ? (
					<Stack
						direction='row'
						useFlexGap
						spacing={0.5}
						sx={theme => ({ alignItems: 'center', flexShrink: 0, color: theme.tokens.color.won[700] })}
					>
						<AppIcon name='check' size='small' />
						<BodySmall sx={{ fontSize: 12, color: 'inherit' }}>Opgeslagen</BodySmall>
					</Stack>
				) : null}
			</Box>
		</Stack>
	);
}

/** An always-mounted row that expands/collapses (height + fade) so both add AND remove animate. */
function ThreadSlot({
	active,
	delayMs,
	maxHeight,
	children
}: {
	active: boolean;
	delayMs: number;
	maxHeight: number;
	children: ReactNode;
}) {
	return (
		<Box
			sx={theme => ({
				overflow: 'hidden',
				maxHeight: active ? maxHeight : 0,
				opacity: active ? 1 : 0,
				transform: active ? 'none' : 'translateY(-4px)',
				transition: [
					`max-height 300ms ${theme.tokens.motion.easeOut} ${delayMs}ms`,
					`opacity 240ms ${theme.tokens.motion.easeOut} ${delayMs}ms`,
					`transform 300ms ${theme.tokens.motion.easeOut} ${delayMs}ms`
				].join(', ')
			})}
		>
			{children}
		</Box>
	);
}

function Emphasis({ children }: { children: ReactNode }) {
	return (
		<Box component='span' sx={theme => ({ color: theme.tokens.color.accent[700], fontWeight: 600 })}>
			{children}
		</Box>
	);
}

/** A number that pops (translate + scale) when it changes — remounts on value change via `key`. */
function PopNumber({ value }: { value: number }) {
	return (
		<Box
			key={value}
			component='span'
			className='tabular'
			sx={theme => ({
				display: 'inline-block',
				animation: `qmNumberPop ${theme.tokens.motion.durBase}ms ${theme.tokens.motion.easeOut}`,
				'@keyframes qmNumberPop': {
					'0%': { transform: 'translateY(-2px) scale(1.04)' },
					'100%': { transform: 'translateY(0) scale(1)' }
				}
			})}
		>
			{value}
		</Box>
	);
}

/** Big accent value ("N unit") shown top-right of a control header. */
function SliderValue({ value, unit }: { value: number; unit: string }) {
	return (
		<Box
			sx={theme => ({
				fontFamily: theme.tokens.font.display,
				fontWeight: 600,
				fontSize: 26,
				lineHeight: 1,
				color: theme.tokens.color.accent[700]
			})}
		>
			<PopNumber value={value} />
			<Box
				component='span'
				sx={theme => ({
					fontFamily: theme.tokens.font.sans,
					fontWeight: 500,
					fontSize: 15,
					color: theme.tokens.color.ink3,
					ml: 0.75
				})}
			>
				{unit}
			</Box>
		</Box>
	);
}

/* ── Cadence slider + presets ── */

interface CadenceSliderProps {
	value: number;
	disabled: boolean;
	onLiveChange: (value: number) => void;
	onCommit: (value: number) => void;
}

function CadenceSlider({ value, disabled, onLiveChange, onCommit }: CadenceSliderProps) {
	return (
		<Box sx={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
			<Stack direction='row' sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 1.75 }}>
				<BodySmall color='textSecondary'>Wachttijd tussen check-ins</BodySmall>
				<SliderValue value={value} unit={pluralize(value, 'dag', 'dagen')} />
			</Stack>

			<Slider
				value={value}
				min={CADENCE_MIN}
				max={CADENCE_MAX}
				step={1}
				disabled={disabled}
				aria-label='Wachttijd tussen check-ins'
				onChange={(_, next) => onLiveChange(single(next))}
				onChangeCommitted={(_, next) => onCommit(single(next))}
				sx={sliderSx}
			/>

			<Stack direction='row' sx={{ justifyContent: 'space-between', mt: 1 }}>
				{['1 dag', '1 week', '2 weken'].map(label => (
					<BodySmall key={label} color='textSecondary' sx={{ fontSize: 11 }}>
						{label}
					</BodySmall>
				))}
			</Stack>
		</Box>
	);
}

/* ── Attempt-cap slider (0..max) ── */

function MaxCountSlider({
	value,
	onLiveChange,
	onCommit
}: {
	value: number;
	onLiveChange: (value: number) => void;
	onCommit: (value: number) => void;
}) {
	return (
		<Box>
			<Stack direction='row' sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 1.75 }}>
				<BodySmall color='textSecondary'>Aantal pogingen</BodySmall>
				<SliderValue value={value} unit='×' />
			</Stack>

			<Slider
				value={value}
				min={FOLLOW_UP_MAX_COUNT_MIN}
				max={FOLLOW_UP_MAX_COUNT_MAX}
				step={1}
				marks
				aria-label='Aantal pogingen'
				onChange={(_, next) => onLiveChange(single(next))}
				onChangeCommitted={(_, next) => onCommit(single(next))}
				sx={theme => ({
					...sliderSx(theme),
					'& .MuiSlider-mark': {
						width: 4,
						height: 4,
						borderRadius: '50%',
						backgroundColor: theme.tokens.color.surface,
						opacity: 1
					},
					'& .MuiSlider-markActive': { backgroundColor: theme.tokens.color.accent[300] }
				})}
			/>

			<BodySmall color='textSecondary' sx={{ display: 'block', mt: 1 }}>
				{value === 0 ? (
					<>
						<Box component='strong' sx={{ color: 'text.primary' }}>
							0
						</Box>{' '}
						schakelt de feature uit voor de hele organisatie.
					</>
				) : (
					<>
						max. {value} {pluralize(value, 'check-in', 'check-ins')} per aanvraag.
					</>
				)}
			</BodySmall>
		</Box>
	);
}

/* ── Simulated mail bubble ── */

interface MailBubbleProps {
	avatarInit: string;
	author: string;
	day: number;
	subject: string;
	body: string;
	concept?: boolean;
	sent?: boolean;
}

function MailBubble({ avatarInit, author, day, subject, body, concept, sent }: MailBubbleProps) {
	return (
		<Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
			<Box
				sx={theme => ({
					width: 34,
					height: 34,
					flexShrink: 0,
					borderRadius: `${theme.tokens.radius.md}px`,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontWeight: 600,
					fontSize: 14,
					backgroundColor: concept ? theme.tokens.color.accent[500] : theme.tokens.color.paper3,
					color: concept ? theme.tokens.color.accent.fg : theme.tokens.color.ink2,
					border: concept ? 'none' : `1px solid ${theme.tokens.color.lineStrong}`
				})}
			>
				{avatarInit}
			</Box>
			<Box
				sx={theme => ({
					flex: 1,
					minWidth: 0,
					backgroundColor: theme.tokens.color.surface,
					border: `1px solid ${concept ? theme.tokens.color.accent[300] : theme.tokens.color.line}`,
					borderRadius: `${theme.tokens.radius.md}px`,
					py: 1.5,
					px: 1.75,
					boxShadow: theme.tokens.shadow[1]
				})}
			>
				<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center', mb: 0.5, flexWrap: 'wrap' }}>
					<BodySmall fontWeight='medium' sx={{ fontSize: 13 }}>
						{author}
					</BodySmall>
					{concept && (
						<Stack
							direction='row'
							useFlexGap
							spacing={0.5}
							sx={theme => ({
								alignItems: 'center',
								py: 0.25,
								px: 1,
								borderRadius: `${theme.tokens.radius.sm}px`,
								color: theme.tokens.color.accent[700],
								backgroundColor: theme.tokens.color.accent[50],
								border: `1px solid ${theme.tokens.color.accent[300]}`
							})}
						>
							<AppIcon name='sparkles' size='small' filled />
							<BodySmall fontWeight='medium' sx={{ fontSize: 11, color: 'inherit' }}>
								Concept
							</BodySmall>
						</Stack>
					)}
					{sent && (
						<Stack
							direction='row'
							useFlexGap
							spacing={0.5}
							sx={theme => ({ alignItems: 'center', color: theme.tokens.color.won[700] })}
						>
							<AppIcon name='check' size='small' />
							<BodySmall fontWeight='medium' sx={{ fontSize: 11, color: 'inherit' }}>
								Verzonden
							</BodySmall>
						</Stack>
					)}
					<BodySmall className='tabular' color='textSecondary' sx={{ fontSize: 12, ml: 'auto' }}>
						Dag {day}
					</BodySmall>
				</Stack>
				<BodySmall fontWeight='medium' sx={{ display: 'block', fontSize: 13, mb: 0.25 }}>
					{subject}
				</BodySmall>
				<BodySmall color='textSecondary' sx={{ display: 'block', fontSize: 13, lineHeight: 1.5 }}>
					{body}
				</BodySmall>
				{concept && (
					<Stack direction='row' useFlexGap spacing={1} sx={{ mt: 1.25 }}>
						<Button variant='contained' size='small' startIcon={<AppIcon name='send' size='small' />}>
							Versturen
						</Button>
						<Button variant='text' size='small' startIcon={<AppIcon name='pen-line' size='small' />}>
							Bewerken
						</Button>
					</Stack>
				)}
			</Box>
		</Box>
	);
}

/* ── Org-wide disable zone ── */

function DisableZone({ disabled, onToggle }: { disabled: boolean; onToggle: () => void }) {
	return (
		<Paper
			variant='outlined'
			sx={theme => ({
				p: 0,
				overflow: 'hidden',
				borderColor: disabled ? theme.tokens.color.pending[500] : undefined
			})}
		>
			<Box
				sx={theme => ({
					py: 2.25,
					px: 3,
					backgroundColor: disabled ? theme.tokens.color.pending[50] : 'transparent',
					display: 'flex',
					alignItems: 'center',
					gap: 2
				})}
			>
				<Box
					sx={theme => ({
						width: 40,
						height: 40,
						flexShrink: 0,
						borderRadius: `${theme.tokens.radius.md}px`,
						backgroundColor: disabled ? theme.tokens.color.surface : theme.tokens.color.paper2,
						border: `1px solid ${disabled ? theme.tokens.color.pending[500] : theme.tokens.color.lineStrong}`,
						color: disabled ? theme.tokens.color.pending[700] : theme.tokens.color.ink3,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center'
					})}
				>
					<AppIcon name={disabled ? 'alert-triangle' : 'power'} size='medium' />
				</Box>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<BodySmall fontWeight='medium' sx={{ display: 'block', mb: 0.25 }}>
						{disabled
							? 'Automatische follow-ups staan uit voor deze organisatie'
							: 'Schakel automatische follow-ups uit voor de hele organisatie'}
					</BodySmall>
					<BodySmall color='textSecondary' sx={{ display: 'block', lineHeight: 1.55 }}>
						{disabled
							? 'Niemand in dit team ontvangt nieuwe concept-follow-ups. Bestaande concepten blijven beschikbaar tot je ze verstuurt of verwijdert.'
							: 'Offertum stelt geen check-ins meer op, ook niet voor nieuwe aanvragen. Je doet zelf alle opvolg-mails.'}
					</BodySmall>
				</Box>
				<Button
					variant='contained'
					onClick={onToggle}
					color={disabled ? 'primary' : 'warning'}
					startIcon={<AppIcon name={disabled ? 'play' : 'power'} size='small' />}
					sx={{ flexShrink: 0 }}
				>
					{disabled ? 'Weer inschakelen' : 'Uitschakelen'}
				</Button>
			</Box>
		</Paper>
	);
}
