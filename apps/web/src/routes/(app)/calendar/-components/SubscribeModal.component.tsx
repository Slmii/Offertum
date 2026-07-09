import { Dialog } from '@/components/Dialog.component';
import { SubscribeCta } from '@/components/SubscribeCta.component';
import { BodySmall, Label, Overline } from '@/components/Text.component';
import { UpsellCheckItem } from '@/components/UpsellCheckItem.component';
import { UpsellLockTile } from '@/components/UpsellLockTile.component';
import { useToast } from '@/lib/hooks/use-toast';
import {
	calendarFeedQueryOptions,
	useGenerateCalendarFeed,
	useRevokeCalendarFeed
} from '@/lib/queries/calendar.queries';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * "Abonneer in je agenda" modal (the design's `SubscribeModal`). Entitled orgs manage their
 * personal iCal feed token (create / copy / revoke) + per-app instructions; non-entitled orgs see
 * the subscribe upsell. The feed query is subscription-gated server-side, so it only runs once the
 * modal is open AND the org is entitled. Rendered unconditionally with the `open` prop so the close
 * transition plays.
 */
export function SubscribeModal({
	open,
	isEntitled,
	isOwner,
	onClose
}: {
	open: boolean;
	isEntitled: boolean;
	isOwner: boolean;
	onClose: () => void;
}) {
	const { tokens } = useTheme();
	const toast = useToast();
	const { data: feed } = useQuery({ ...calendarFeedQueryOptions, enabled: open && isEntitled });
	const generate = useGenerateCalendarFeed();
	const revoke = useRevokeCalendarFeed();
	const [copied, setCopied] = useState(false);

	const url = feed?.url ?? null;

	const copy = (): void => {
		if (!url || !navigator.clipboard) {
			return;
		}
		void navigator.clipboard.writeText(url).then(() => {
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		});
	};

	const onGenerate = (): void => {
		generate.mutate(undefined, { onError: () => toast.error('Aanmaken mislukt', 'Probeer het opnieuw.') });
	};

	const onRevoke = (): void => {
		revoke.mutate(undefined, { onError: () => toast.error('Intrekken mislukt', 'Probeer het opnieuw.') });
	};

	return (
		<Dialog
			open={open}
			title='Abonneer in je agenda'
			onClose={onClose}
			width={560}
			action={
				!isEntitled ? (
					<>
						<Button variant='text' color='inherit' onClick={onClose}>
							Annuleren
						</Button>
						<SubscribeCta isOwner={isOwner} />
					</>
				) : url ? (
					<>
						<Button variant='text' color='error' onClick={onRevoke} disabled={revoke.isPending}>
							Link intrekken
						</Button>
						<Button variant='contained' onClick={onClose}>
							Klaar
						</Button>
					</>
				) : (
					<Button variant='contained' onClick={onClose}>
						Klaar
					</Button>
				)
			}
		>
			{!isEntitled ? (
				<Stack useFlexGap spacing={2.5}>
					<Stack direction='row' useFlexGap spacing={2.25} sx={{ alignItems: 'flex-start' }}>
						<UpsellLockTile />
						<BodySmall sx={{ color: tokens.color.ink2, lineHeight: 1.55 }}>
							Agenda-synchronisatie hoort bij een abonnement. Met een abonnement verschijnt je
							offerte-tijdlijn automatisch tussen je eigen afspraken.
						</BodySmall>
					</Stack>
					<Stack useFlexGap spacing={1.25}>
						<UpsellCheckItem>
							Je offerte-tijdlijn live in Google Agenda, Outlook of Apple Calendar
						</UpsellCheckItem>
						<UpsellCheckItem>Follow-ups en verloopdatums tussen je eigen afspraken</UpsellCheckItem>
						<UpsellCheckItem>Automatisch elke 6 uur ververst, niets handmatig bijhouden</UpsellCheckItem>
					</Stack>
				</Stack>
			) : (
				<Stack useFlexGap spacing={2.5}>
					<BodySmall color='textSecondary'>
						Voeg deze link toe in Google Agenda, Outlook of Apple Calendar. Je offerte-tijdlijn verschijnt
						dan tussen je eigen afspraken. De agenda wordt elke 6 uur ververst.
					</BodySmall>

					{url ? (
						<Box>
							<Label component='label' sx={{ display: 'block', mb: 0.75 }}>
								Persoonlijke iCal-link
							</Label>
							<TextField
								value={url}
								fullWidth
								size='small'
								onFocus={event => event.target.select()}
								slotProps={{
									input: {
										readOnly: true,
										endAdornment: (
											<Button size='small' onClick={copy} sx={{ flexShrink: 0, ml: 1 }}>
												{copied ? 'Gekopieerd' : 'Kopieer'}
											</Button>
										)
									}
								}}
							/>
							<BodySmall color='textSecondary' sx={{ display: 'block', mt: 0.75 }}>
								Deze link is uniek voor jou. Deel 'm niet, iedereen met de link kan je tijdlijn lezen.
							</BodySmall>
						</Box>
					) : (
						<Button
							variant='contained'
							onClick={onGenerate}
							disabled={generate.isPending}
							sx={{ alignSelf: 'flex-start' }}
						>
							{generate.isPending ? 'Aanmaken…' : 'Abonnement aanmaken'}
						</Button>
					)}

					<Box>
						<Overline color='text.disabled' sx={{ display: 'block', mb: 1 }}>
							Instructies per agenda
						</Overline>
						<SubInstr
							title='Google Agenda'
							steps={["Andere agenda's toevoegen → Via URL", "Plak de link en klik 'Agenda toevoegen'"]}
						/>
						<SubInstr
							title='Outlook'
							steps={[
								"Agenda's toevoegen → Abonneer op een agenda",
								"Plak de link, geef 'm een naam (bv. Offertum) en bevestig"
							]}
						/>
						<SubInstr
							title='Apple Calendar'
							steps={[
								'Bestand → Nieuw agenda-abonnement…',
								"Plak de link, kies de frequentie 'Elke 6 uur'"
							]}
							isLast
						/>
					</Box>
				</Stack>
			)}
		</Dialog>
	);
}

function SubInstr({ title, steps, isLast = false }: { title: string; steps: string[]; isLast?: boolean }) {
	const { tokens } = useTheme();
	return (
		<Box sx={{ py: 1.25, borderBottom: isLast ? 'none' : `1px solid ${tokens.color.line}` }}>
			<BodySmall fontWeight='bold' color='text.primary' sx={{ display: 'block', mb: 0.5 }}>
				{title}
			</BodySmall>
			<Box
				component='ol'
				sx={{ m: 0, pl: 2.25, color: tokens.color.ink3, fontSize: 13, lineHeight: 1.55, '& li': { mb: 0.25 } }}
			>
				{steps.map((step, index) => (
					<li key={index}>{step}</li>
				))}
			</Box>
		</Box>
	);
}
