import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { FlowingGradient } from '@/components/FlowingGradient.component';
import { BodySmall, H3 } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import {
	opportunityExpiryActionQueryOptions,
	useDismissExpiryAction,
	useTakeExpiryAction
} from '@/lib/queries/expiry.queries';
import { toDaysUntilLabel, toReadableDate } from '@/lib/utils/date.utils';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import { alpha, useTheme } from '@mui/material/styles';
import { EXPIRY_ACTION_KINDS, type ExpiryActionKindValue } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';

const EXPIRY_ACTION_LABELS_NL: Record<ExpiryActionKindValue, string> = {
	EXTEND_14D: 'Verleng 14 dagen',
	LAST_FOLLOWUP: 'Laatste herinnering',
	MARK_LOST: 'Markeer verloren'
};

const EXPIRY_ACTION_ICONS: Record<ExpiryActionKindValue, AppIconName> = {
	EXTEND_14D: 'calendar',
	LAST_FOLLOWUP: 'send',
	MARK_LOST: 'x'
};

/**
 * Smart-expiry suggestion card (W13) — ported from the design's amber "Verloopt op …" card.
 * Surfaced near the top of the opportunity detail rail when the watcher has produced a live
 * SUGGESTED action for a soon-to-expire quote. The expiry date is an absolute date via
 * `toReadableDate`; the "nog N dagen" chip is relative (see `toDaysUntilLabel`). Three full-width
 * actions: the recommended one is solid accent + an "Aanbevolen" badge, the rest are paper-filled.
 * Take/dismiss are `@OwnerWrite` on the API, so members see a read-only note instead of buttons.
 */
export function ExpiryActionCard({ opportunityId, isOwner }: { opportunityId: string; isOwner: boolean }) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const toast = useToast();
	const { data: expiryAction } = useSuspenseQuery(opportunityExpiryActionQueryOptions(opportunityId));
	const takeAction = useTakeExpiryAction(opportunityId);
	const dismiss = useDismissExpiryAction(opportunityId);

	if (!expiryAction) {
		return null;
	}

	const isPending = takeAction.isPending || dismiss.isPending;
	const onActionError = (err: unknown) =>
		toast.error('Actie mislukt', err instanceof Error ? err.message : 'Probeer het opnieuw.');

	return (
		<Box
			sx={{
				p: 2.5,
				borderRadius: `${tokens.radius.xl}px`,
				backgroundColor: c.pending[50],
				border: `1px solid ${c.pending[500]}`
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
				<Box
					sx={{
						flexShrink: 0,
						width: 24,
						height: 24,
						borderRadius: `${tokens.radius.sm}px`,
						backgroundColor: alpha(c.pending[500], 0.18),
						color: c.pending[700],
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center'
					}}
				>
					<AppIcon name='alarm-clock' size='small' />
				</Box>
				<H3
					component='span'
					sx={{
						flex: 1,
						minWidth: 0,
						color: c.pending[700]
					}}
				>
					Verloopt op {toReadableDate(expiryAction.validUntil)}
				</H3>
				{isOwner && (
					<IconButton
						aria-label='Negeren'
						onClick={() => dismiss.mutate({ id: expiryAction.id }, { onError: onActionError })}
						disabled={isPending}
						sx={{
							flexShrink: 0,
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							p: 0.5,
							border: 'none',
							background: 'transparent',
							borderRadius: `${tokens.radius.sm}px`,
							color: c.pending[700],
							cursor: isPending ? 'default' : 'pointer',
							'&:hover': { backgroundColor: alpha(c.pending[500], 0.18) }
						}}
					>
						<AppIcon name='x' size='small' />
					</IconButton>
				)}
			</Box>

			<Box
				component='span'
				sx={{
					display: 'inline-block',
					mb: 1.5,
					px: 1.25,
					py: 0.5,
					borderRadius: `${tokens.radius.md}px`,
					backgroundColor: alpha(c.pending[500], 0.2),
					color: c.pending[700],
					fontSize: 12.5,
					fontWeight: 'bold'
				}}
			>
				{toDaysUntilLabel(expiryAction.validUntil)}
			</Box>

			<Box sx={{ fontSize: 14, lineHeight: 1.55, color: c.pending[700], mb: 2 }}>
				{expiryAction.suggestedCopy}
			</Box>

			{isOwner ? (
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
					{EXPIRY_ACTION_KINDS.map(kind => {
						const isRecommended = kind === expiryAction.recommendedAction;
						const isThisPending = takeAction.isPending && takeAction.variables?.kind === kind;

						return (
							<ButtonBase
								key={kind}
								onClick={() =>
									takeAction.mutate({ id: expiryAction.id, kind }, { onError: onActionError })
								}
								disabled={isPending}
								sx={{
									position: 'relative',
									overflow: 'hidden',
									display: 'flex',
									alignItems: 'center',
									gap: 1,
									width: '100%',
									minHeight: 44,
									px: 1.75,
									textAlign: 'left',
									borderRadius: `${tokens.radius.md}px`,
									fontFamily: tokens.font.sans,
									fontSize: 14,
									fontWeight: 'medium',
									cursor: isPending ? 'default' : 'pointer',
									transition: `background ${tokens.motion.durFast}ms`,
									...(isRecommended
										? {
												// Background is the animated FlowingGradient layer below.
												border: `1px solid ${c.accent[500]}`,
												color: c.accent.fg
											}
										: {
												backgroundColor: c.paper,
												border: `1px solid ${c.line}`,
												color: c.ink1,
												'&:hover': { backgroundColor: c.paper2, borderColor: c.lineStrong }
											})
								}}
							>
								{isRecommended && (
									<FlowingGradient sx={{ position: 'absolute', inset: 0, zIndex: 0 }} />
								)}
								<Box
									component='span'
									sx={{ position: 'relative', zIndex: 1, display: 'inline-flex', flexShrink: 0 }}
								>
									{isThisPending ? (
										<CircularProgress size={14} color='inherit' />
									) : (
										<AppIcon name={EXPIRY_ACTION_ICONS[kind]} size='small' />
									)}
								</Box>
								<Box component='span' sx={{ position: 'relative', zIndex: 1, flex: 1 }}>
									{EXPIRY_ACTION_LABELS_NL[kind]}
								</Box>
								{isRecommended && (
									<Box
										component='span'
										sx={{
											position: 'relative',
											zIndex: 1,
											flexShrink: 0,
											px: 1,
											py: 0.25,
											borderRadius: `${tokens.radius.sm}px`,
											backgroundColor: alpha('#ffffff', 0.18),
											color: c.accent.fg,
											fontSize: 11,
											fontWeight: 'bold'
										}}
									>
										Aanbevolen
									</Box>
								)}
							</ButtonBase>
						);
					})}
				</Box>
			) : (
				<BodySmall sx={{ color: c.pending[700] }}>Alleen de eigenaar kan deze acties uitvoeren.</BodySmall>
			)}
		</Box>
	);
}
