import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { BannerStack } from '@/components/BannerStack.component';
import { Dialog } from '@/components/Dialog.component';
import { Field, StandaloneField } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { Switch as FormSwitch, StandaloneSwitch } from '@/components/Form/Switch/Switch.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SectionError } from '@/components/SectionError.component';
import { BodySmall, H2, H3, Overline } from '@/components/Text.component';
import { UpsellTeaser } from '@/components/UpsellTeaser.component';
import { useToast } from '@/lib/hooks/use-toast';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import {
	pricingPlaybookQueryOptions,
	pricingRulesQueryOptions,
	useDeletePricingRule,
	useUpdatePricingPlaybook,
	useUpdatePricingRule
} from '@/lib/queries/pricing-playbook.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { PricingRuleEditSchema, type PricingRuleEditForm } from '@/lib/schemas/pricing-rule-edit.schema';
import { toReadableTimestamp } from '@/lib/utils/date.utils';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { type Theme } from '@mui/material/styles';
import {
	isPricingEffectType,
	PRICING_PLAYBOOK_TEXT_MAX_LENGTH,
	type PricingRule,
	type PricingRuleJsonObject,
	type PricingRuleType
} from '@offertum/shared';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Pricing playbook — the "table" design. The owner writes their pricing policy as free-form Dutch
 * prose in a collapsible editor; a server-side compile pass turns it into typed pricing rules that
 * auto-fill quotes. Those compiled rules are shown as one dense, scannable table with per-row
 * toggle / edit / delete. Owner-only + subscription-gated (upsell for non-entitled orgs).
 */
export const Route = createFileRoute('/(app)/settings/pricing-playbook')({
	beforeLoad: async ({ context }) => {
		const me = await context.queryClient.ensureQueryData(myMembershipQueryOptions);
		if (me.role !== 'OWNER') {
			throw redirect({ to: '/' });
		}
	},
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(billingStatusQueryOptions),
			context.queryClient.ensureQueryData(pricingPlaybookQueryOptions),
			context.queryClient.ensureQueryData(pricingRulesQueryOptions)
		]);
	},
	component: PricingPlaybookSettingsPage,
	errorComponent: SectionError
});

const RULE_TYPE_META: Record<PricingRuleType, { label: string; icon: AppIconName }> = {
	hourly_rate: { label: 'Uurtarief', icon: 'clock' },
	material_markup: { label: 'Materiaalopslag', icon: 'package' },
	vat: { label: 'BTW', icon: 'percent' },
	travel: { label: 'Reiskosten', icon: 'map-pin' },
	urgency: { label: 'Spoedtoeslag', icon: 'zap' },
	discount: { label: 'Korting', icon: 'tag' },
	minimum_order: { label: 'Minimumorder', icon: 'shopping-cart' }
};

const EXAMPLES = [
	{
		title: 'Voorbeeld, generieke MKB',
		body: [
			'Standaard uurtarief: € 75 per uur.',
			'BTW: 21% op alle diensten en materialen.',
			'Voor spoedklussen (binnen 24 uur) reken ik 25% extra.',
			'Materialen reken ik door met 15% opslag.',
			'Reiskosten: € 0,40 per km, gratis binnen 10 km.',
			'Minimumorder: € 150.'
		].join('\n')
	},
	{
		title: 'Voorbeeld, dienstverlener',
		body: [
			'Mijn uurtarief is € 95 per uur voor consultancy, € 65 voor administratieve werkzaamheden.',
			'Voor projecten boven de € 5.000 geef ik 5% korting.',
			'BTW: 21%.',
			'Voor klanten in België reken ik BTW verlegd.'
		].join('\n')
	},
	{
		title: 'Voorbeeld, vakman',
		body: [
			'Loodgieterswerk: € 85/uur. Elektrotechniek: € 95/uur.',
			'Voorrijkosten € 35 binnen Utrecht-stad, € 0,50/km buiten de stad.',
			'Materialen + 20% opslag.',
			'BTW 21% op materialen, 9% op arbeid bij renovatie van woningen ouder dan 2 jaar.',
			'Avond/weekend tarief: +50%. Spoedwerk binnen 4 uur: +75%.'
		].join('\n')
	}
];

function PricingPlaybookSettingsPage() {
	const { data: billing } = useSuspenseQuery(billingStatusQueryOptions);
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);

	if (!isBillingEntitled(billing.state)) {
		return <PricingPlaybookUpsell isOwner={me.role === 'OWNER'} />;
	}

	return <PricingPlaybookEditor />;
}

const UPSELL_BULLETS = [
	'Tarieven, materiaalopslag en BTW in je eigen woorden',
	'Automatisch toegepast op elke offerte',
	'Regels aanpassen zonder formules of tabellen'
] as const;

/**
 * Locked Prijsregels upsell — shown to owners whose org is NOT entitled (no active
 * subscription/trial). Reuses the shared `UpsellTeaser` (lock tile + headline + check-listed
 * value props + subscribe CTA) with Prijsregels-specific copy, so the design stays DRY.
 */
function PricingPlaybookUpsell({ isOwner }: { isOwner: boolean }) {
	return (
		<Stack useFlexGap spacing={3}>
			<PageHeader
				title='Prijsregels'
				caption='Schrijf je tarieven, opslagen en BTW in gewone taal — Offertum zet ze om in regels en prijst je offertes automatisch.'
				disableMargin
			/>
			<UpsellTeaser
				isOwner={isOwner}
				title='Beschrijf je prijsbeleid in je eigen woorden'
				items={UPSELL_BULLETS}
			/>
		</Stack>
	);
}

function PricingPlaybookEditor() {
	const { data } = useSuspenseQuery(pricingPlaybookQueryOptions);

	const [seed, setSeed] = useState(data);
	const [prose, setProse] = useState(data.playbookText);
	const [savedProse, setSavedProse] = useState(data.playbookText);
	const [proseOpen, setProseOpen] = useState(true);

	// Re-seed local editor state when the server config changes (e.g. after a save refetch).
	if (data !== seed) {
		setSeed(data);
		setProse(data.playbookText);
		setSavedProse(data.playbookText);
	}

	// When the async compile settles (processing → succeeded/failed), refetch the rule list so the
	// table reflects the new (or cleared) rules immediately. The playbook query polls while
	// processing; this fires the one rules refetch on the transition.
	const queryClient = useQueryClient();
	const prevCompileStatus = useRef(data.compileStatus);
	useEffect(() => {
		if (prevCompileStatus.current === 'processing' && data.compileStatus !== 'processing') {
			void queryClient.invalidateQueries({ queryKey: pricingRulesQueryOptions.queryKey });
		}
		prevCompileStatus.current = data.compileStatus;
	}, [data.compileStatus, queryClient]);

	return (
		<Stack useFlexGap spacing={3}>
			<PageHeader
				title='Prijsregels'
				caption="Beschrijf hoe je je prijzen bepaalt — in je eigen woorden, geen vaste vorm. Offertum leest je tekst en zet 'm om in regels die je offertes automatisch invullen."
				disableMargin
			/>
			<BannerStack
				sx={{ alignItems: 'flex-start' }}
				banners={[
					{
						tone: 'info',
						title: 'Tip',
						body: (
							<>
								Schrijf elke prijsregel op een eigen regel of in een eigen zin. Eén uitspraak per regel
								maakt het makkelijker voor Offertum om je tekst correct te vertalen naar losse regels.{' '}
								<em>Bijv. "€ 85/uur voor loodgieterswerk en € 95 voor elektra"</em> werkt, maar twee
								aparte regels geven beter resultaat.
							</>
						)
					},
					{
						tone: 'warning',
						title: 'Meerdere spoedtoeslagen?',
						body: (
							<>
								Offertum vertaalt spoed-bewoordingen zoals &quot;binnen 24 uur&quot; en &quot;zelfde
								dag&quot; naar een paar vaste spoedniveaus. Vallen twee spoedregels op hetzelfde niveau,
								dan telt er per offerte maar <strong>één</strong> mee — die met de hoogste prioriteit.
								Gebruik je meerdere spoedtoeslagen? Controleer dan of ze duidelijk verschillende
								situaties beschrijven.
							</>
						)
					}
				]}
			/>
			<ProseEditor
				prose={prose}
				savedProse={savedProse}
				proseOpen={proseOpen}
				onProseChange={setProse}
				onProseSaved={setSavedProse}
				onToggleOpen={setProseOpen}
			/>
			<RulesTable />
			<ExamplesSection
				onUse={body => {
					setProse(body);
					setProseOpen(true);
					// The examples sit at the bottom of the page — scroll back up to the editor so the
					// owner sees the prose that was just dropped in.
					window.scrollTo({ top: 0, behavior: 'smooth' });
				}}
			/>
		</Stack>
	);
}

/* ── Collapsible prose editor ── */

interface ProseEditorProps {
	prose: string;
	savedProse: string;
	proseOpen: boolean;
	onProseChange: (value: string) => void;
	onProseSaved: (value: string) => void;
	onToggleOpen: (open: boolean) => void;
}

function ProseEditor({ prose, savedProse, proseOpen, onProseChange, onProseSaved, onToggleOpen }: ProseEditorProps) {
	const { data } = useSuspenseQuery(pricingPlaybookQueryOptions);
	const update = useUpdatePricingPlaybook();
	const toast = useToast();

	const [savedFlash, setSavedFlash] = useState(false);

	const dirty = prose !== savedProse;
	// While the Inngest compile is running, block another save. Serializing saves avoids overlapping
	// compile runs (and the status races they cause); the owner can still type, just not re-save until
	// it settles (the query polls, so this clears within a few seconds).
	const isProcessing = data.compileStatus === 'processing';
	// Compile-state pill. Server compile status wins (the Inngest job is the source of truth for
	// processing/failed); otherwise fall back to the editor's own state: unsaved edits → "stale",
	// blank editor → "never", nothing pending → "fresh".
	const compileState: CompileState =
		data.compileStatus === 'processing'
			? 'processing'
			: data.compileStatus === 'failed'
				? 'failed'
				: dirty
					? 'stale'
					: savedProse.trim().length === 0
						? 'never'
						: 'fresh';

	const handleSave = () => {
		update.mutate(
			{ playbookText: prose },
			{
				onSuccess: () => {
					onProseSaved(prose);
					setSavedFlash(true);
					window.setTimeout(() => setSavedFlash(false), 2500);
				},
				onError: error =>
					toast.error('Opslaan mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.')
			}
		);
	};

	return (
		<Accordion
			variant='outlined'
			disableGutters
			expanded={proseOpen}
			onChange={(_, expanded) => onToggleOpen(expanded)}
			sx={theme => ({
				// The DS theme styles the summary via `& .MuiAccordionSummary-root` (specificity 0,2,0),
				// so component-level sx on <AccordionSummary> (0,1,0) loses — the summary would keep the
				// theme's collapsed min-height (0) while MUI's default expanded min-height (64) wins,
				// making the collapsed state shorter than the expanded one. Override off the root at the
				// same specificity and pin BOTH states to 60px so the height never changes on open/close.
				'& .MuiAccordionSummary-root': {
					padding: theme.spacing(0, 2.5),
					minHeight: 60,
					backgroundColor: theme.tokens.color.surface,
					'&:hover': { backgroundColor: theme.tokens.color.surface },
					'&.Mui-expanded': { minHeight: 60 },
					'& .MuiAccordionSummary-content': {
						margin: 0,
						alignItems: 'center',
						gap: theme.spacing(1.25),
						minWidth: 0
					},
					'& .MuiAccordionSummary-content.Mui-expanded': { margin: 0 }
				}
			})}
		>
			<AccordionSummary expandIcon={<AppIcon name='chevron-down' size='small' />}>
				<Box
					sx={theme => ({
						fontFamily: theme.tokens.font.display,
						fontWeight: 500,
						fontSize: 16,
						color: theme.tokens.color.ink1,
						flexShrink: 0
					})}
				>
					Jouw prijsbeleid
				</Box>
				<CompileChip state={compileState} compiledAt={data.compiledAt} />
			</AccordionSummary>
			<AccordionDetails sx={{ p: 0 }}>
				<Box sx={theme => ({ p: 2, borderTop: `1px solid ${theme.tokens.color.line}` })}>
					<StandaloneField
						name='playbook-text'
						value={prose}
						onChange={event => onProseChange(event.target.value)}
						multiline
						minRows={8}
						maxRows={24}
						maxLength={PRICING_PLAYBOOK_TEXT_MAX_LENGTH}
						placeholder={[
							'Bijvoorbeeld:',
							'Mijn standaard uurtarief is € 75 per uur.',
							'Voor loodgieterswerk reken ik € 95 per uur.',
							'BTW is 21%.',
							'Voor spoedklussen reken ik 25% extra.'
						].join('\n')}
						fullWidth
					/>
				</Box>
				<Box
					sx={theme => ({
						py: 1.5,
						px: 2,
						borderTop: `1px solid ${theme.tokens.color.line}`,
						backgroundColor: theme.tokens.color.paper2,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: 1.5
					})}
				>
					<BodySmall color='textSecondary' sx={{ fontSize: 12 }}>
						{savedFlash ? (
							<Box
								component='span'
								sx={theme => ({
									display: 'inline-flex',
									alignItems: 'center',
									gap: 0.5,
									color: theme.tokens.color.won[700]
								})}
							>
								<AppIcon name='check' size='small' /> Opgeslagen. Regels worden bijgewerkt.
							</Box>
						) : dirty ? (
							<Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
								<Box
									component='span'
									sx={theme => ({
										width: 6,
										height: 6,
										borderRadius: '50%',
										backgroundColor: theme.tokens.color.pending[500]
									})}
								/>
								Niet-opgeslagen wijzigingen
							</Box>
						) : (
							<>Opslaan triggert opnieuw verwerken.</>
						)}
					</BodySmall>
					<Button
						variant='contained'
						onClick={handleSave}
						disabled={!dirty || update.isPending || isProcessing}
					>
						{update.isPending ? 'Opslaan…' : 'Opslaan'}
					</Button>
				</Box>
			</AccordionDetails>
		</Accordion>
	);
}

type CompileState = 'fresh' | 'processing' | 'stale' | 'failed' | 'never';

const COMPILE_CHIP_META: Record<CompileState, { icon: AppIconName; label: string }> = {
	fresh: { icon: 'circle-check', label: 'Verwerkt' },
	// `processing` renders a spinner instead of the icon; the name is a harmless placeholder.
	processing: { icon: 'circle-check', label: 'Bezig met verwerken' },
	stale: { icon: 'clock', label: 'Wachtend op verwerking' },
	failed: { icon: 'alert-circle', label: 'Verwerken mislukt' },
	never: { icon: 'clock', label: 'Nog niet verwerkt' }
};

/** Compile-status pill matching the design: Verwerkt (green) / Wachtend op verwerking (amber) / never. */
function CompileChip({ state, compiledAt }: { state: CompileState; compiledAt: string | null }) {
	const meta = COMPILE_CHIP_META[state];
	const sub =
		state === 'fresh'
			? compiledAt
				? `laatst ${toReadableTimestamp(compiledAt)}`
				: 'zojuist'
			: state === 'processing'
				? 'regels worden bijgewerkt'
				: state === 'stale'
					? 'wijzigingen nog niet meegenomen'
					: state === 'failed'
						? 'opnieuw proberen'
						: 'sla je tekst op om te starten';

	return (
		<Stack
			direction='row'
			useFlexGap
			spacing={0.75}
			sx={theme => {
				const c = theme.tokens.color;
				const palette = {
					fresh: { bg: c.won[50], fg: c.won[700], border: c.won[500] },
					processing: { bg: c.accent[50], fg: c.accent[700], border: c.accent[300] },
					stale: { bg: c.pending[50], fg: c.pending[700], border: c.pending[500] },
					failed: { bg: c.lost[50], fg: c.lost[700], border: c.lost[500] },
					never: { bg: c.paper2, fg: c.ink3, border: c.lineStrong }
				}[state];
				return {
					display: 'inline-flex',
					alignItems: 'center',
					flexShrink: 0,
					py: 0.5,
					pl: 1,
					pr: 1.25,
					borderRadius: `${theme.tokens.radius.sm}px`,
					backgroundColor: palette.bg,
					color: palette.fg,
					border: `1px solid ${palette.border}`
				};
			}}
		>
			{state === 'processing' ? (
				<CircularProgress size={12} thickness={5} sx={{ color: 'inherit' }} />
			) : (
				<AppIcon name={meta.icon} size='small' />
			)}
			<BodySmall fontWeight='bold' sx={{ fontSize: 12, color: 'inherit' }}>
				{meta.label}
			</BodySmall>
			<BodySmall sx={{ fontSize: 12, color: 'inherit', opacity: 0.7, whiteSpace: 'nowrap' }}>· {sub}</BodySmall>
		</Stack>
	);
}

/* ── Rules table ── */

const RULE_TH_SX = (theme: Theme) => ({
	py: 1.25,
	px: 2,
	fontSize: 12,
	fontWeight: 600,
	letterSpacing: '0.04em',
	textTransform: 'uppercase' as const,
	color: theme.tokens.color.ink3,
	borderBottom: `1px solid ${theme.tokens.color.line}`
});

function RulesTable() {
	const { data } = useSuspenseQuery(pricingRulesQueryOptions);
	const { data: playbook } = useSuspenseQuery(pricingPlaybookQueryOptions);
	const update = useUpdatePricingRule();
	const remove = useDeletePricingRule();
	const retry = useUpdatePricingPlaybook();
	const toast = useToast();
	const [editing, setEditing] = useState<PricingRule | null>(null);
	const [confirmDelete, setConfirmDelete] = useState<PricingRule | null>(null);

	const rules = data.rules;
	const activeCount = rules.filter(rule => rule.active).length;

	const isProcessing = playbook.compileStatus === 'processing';
	const hasFailed = playbook.compileStatus === 'failed';
	// "Geen prijsregels gevonden" only after a real compile of real text; empty text → "Nog geen regels".
	const everCompiled = playbook.playbookText.trim().length > 0 && playbook.compileStatus === 'succeeded';

	// Retry re-saves the server's stored text — re-triggering the compile on exactly what failed.
	const handleRetry = () =>
		retry.mutate(
			{ playbookText: playbook.playbookText },
			{
				onError: error =>
					toast.error(
						'Opnieuw verwerken mislukt',
						error instanceof Error ? error.message : 'Probeer het opnieuw.'
					)
			}
		);

	const setActive = (rule: PricingRule, active: boolean) =>
		update.mutate(
			{ id: rule.id, active },
			{
				onError: error =>
					toast.error('Bijwerken mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.')
			}
		);

	const doDelete = (rule: PricingRule) =>
		remove.mutate(rule.id, {
			onSuccess: () => setConfirmDelete(null),
			onError: error =>
				toast.error('Verwijderen mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.')
		});

	return (
		<Stack useFlexGap spacing={1.5}>
			<Stack
				direction='row'
				useFlexGap
				spacing={1}
				sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}
			>
				<H2 component='h2' sx={{ fontSize: 18 }}>
					Regels
					{rules.length > 0 && (
						<Box
							component='span'
							sx={theme => ({
								ml: 1,
								fontFamily: theme.tokens.font.sans,
								fontWeight: 400,
								fontSize: 14,
								color: theme.tokens.color.ink4
							})}
						>
							({activeCount} actief · {rules.length} totaal)
						</Box>
					)}
				</H2>
				{isProcessing && (
					<Stack
						direction='row'
						useFlexGap
						spacing={0.75}
						sx={theme => ({ alignItems: 'center', flexShrink: 0, color: theme.tokens.color.ink4 })}
					>
						<CircularProgress size={10} thickness={5} sx={{ color: 'inherit' }} />
						<BodySmall sx={{ fontSize: 12, color: 'inherit' }}>Bijwerken…</BodySmall>
					</Stack>
				)}
			</Stack>

			{hasFailed ? (
				<FailedRulesPanel onRetry={handleRetry} isRetrying={retry.isPending} />
			) : rules.length === 0 ? (
				<EmptyRulesPanel everCompiled={everCompiled} />
			) : (
				<Paper variant='outlined' sx={{ p: 0, overflow: 'hidden' }}>
					<TableContainer sx={{ overflowX: 'auto' }}>
						<Table sx={{ minWidth: 760 }}>
							<TableHead>
								<TableRow sx={theme => ({ backgroundColor: theme.tokens.color.paper2 })}>
									<TableCell sx={theme => ({ ...RULE_TH_SX(theme), width: '34%' })}>
										Type &amp; regel
									</TableCell>
									<TableCell sx={RULE_TH_SX}>Conditie</TableCell>
									<TableCell align='right' sx={theme => ({ ...RULE_TH_SX(theme), width: 140 })}>
										Waarde
									</TableCell>
									<TableCell align='center' sx={theme => ({ ...RULE_TH_SX(theme), width: 90 })}>
										Actief
									</TableCell>
									<TableCell sx={theme => ({ ...RULE_TH_SX(theme), width: 84 })} />
								</TableRow>
							</TableHead>
							<TableBody>
								{rules.map((rule, index) => (
									<RuleRow
										key={rule.id}
										rule={rule}
										isLast={index === rules.length - 1}
										onToggle={active => setActive(rule, active)}
										onEdit={() => setEditing(rule)}
										onDelete={() => setConfirmDelete(rule)}
									/>
								))}
							</TableBody>
						</Table>
					</TableContainer>
				</Paper>
			)}

			<RuleEditDialog rule={editing} onClose={() => setEditing(null)} />

			<Dialog
				open={confirmDelete !== null}
				title='Regel verwijderen?'
				width={460}
				onClose={() => setConfirmDelete(null)}
				action={
					<>
						<Button onClick={() => setConfirmDelete(null)}>Annuleren</Button>
						<Button
							variant='contained'
							color='error'
							startIcon={<AppIcon name='trash' size='small' />}
							disabled={remove.isPending}
							onClick={() => confirmDelete && doDelete(confirmDelete)}
						>
							Verwijderen
						</Button>
					</>
				}
			>
				<BodySmall sx={{ display: 'block' }}>
					Weet je zeker dat je <strong>{confirmDelete?.description}</strong> wilt verwijderen? De regel komt
					niet vanzelf terug — pas je prijsbeleid aan om 'm opnieuw te laten verschijnen.
				</BodySmall>
			</Dialog>
		</Stack>
	);
}

interface RuleRowProps {
	rule: PricingRule;
	isLast: boolean;
	onToggle: (active: boolean) => void;
	onEdit: () => void;
	onDelete: () => void;
}

function RuleRow({ rule, isLast, onToggle, onEdit, onDelete }: RuleRowProps) {
	const meta = RULE_TYPE_META[rule.ruleType];
	const conditionSummary = summarizeCondition(rule.condition);

	return (
		<TableRow
			sx={theme => ({
				opacity: rule.active ? 1 : 0.55,
				transition: `background-color ${theme.tokens.motion.durBase}ms ${theme.tokens.motion.easeOut}`,
				'& td': {
					borderBottom: isLast ? 'none' : `1px solid ${theme.tokens.color.line}`,
					verticalAlign: 'top'
				},
				'&:hover': { backgroundColor: theme.tokens.color.paper2 }
			})}
		>
			<TableCell sx={{ py: 1.5, px: 2 }}>
				<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
					<TypeBadge icon={meta.icon} />
					<Overline sx={theme => ({ color: theme.tokens.color.ink2 })}>{meta.label}</Overline>
					{rule.manualOverride && <ManualBadge />}
				</Stack>
				<BodySmall
					sx={theme => ({
						display: 'block',
						pl: `${22 + 8}px`,
						color: theme.tokens.color.ink1,
						lineHeight: 1.45
					})}
				>
					{rule.description}
				</BodySmall>
			</TableCell>
			<TableCell sx={{ py: 1.5, px: 2 }}>
				{rule.conditionNarrative ? (
					<AiConditionChip condition={rule.conditionNarrative} />
				) : conditionSummary ? (
					<BodySmall color='textSecondary' sx={{ fontStyle: 'italic', fontSize: 13 }}>
						{conditionSummary}
					</BodySmall>
				) : (
					<BodySmall sx={theme => ({ color: theme.tokens.color.ink4, fontSize: 13 })}>Altijd</BodySmall>
				)}
			</TableCell>
			<TableCell align='right' sx={{ py: 1.5, px: 2 }}>
				<BodySmall
					className='tabular'
					fontWeight='bold'
					sx={theme => ({ fontSize: 15, color: theme.tokens.color.ink1, whiteSpace: 'nowrap' })}
				>
					{summarizeEffect(rule.effect)}
				</BodySmall>
			</TableCell>
			<TableCell align='center' sx={{ py: 1.5, px: 2 }}>
				<StandaloneSwitch name={`rule-active-${rule.id}`} checked={rule.active} onChange={onToggle} />
			</TableCell>
			<TableCell sx={{ py: 1.5, px: 2 }}>
				<Stack direction='row' sx={{ gap: 0.25 }}>
					<IconButton size='small' aria-label='Bewerken' onClick={onEdit}>
						<AppIcon name='pen-line' size='small' />
					</IconButton>
					<IconButton
						size='small'
						aria-label='Verwijderen'
						onClick={onDelete}
						sx={theme => ({ color: theme.tokens.color.lost[700] })}
					>
						<AppIcon name='trash' size='small' />
					</IconButton>
				</Stack>
			</TableCell>
		</TableRow>
	);
}

function TypeBadge({ icon }: { icon: AppIconName }) {
	return (
		<Box
			sx={theme => ({
				width: 22,
				height: 22,
				flexShrink: 0,
				borderRadius: `${theme.tokens.radius.sm}px`,
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: theme.tokens.color.accent[50],
				color: theme.tokens.color.accent[700]
			})}
		>
			<AppIcon name={icon} size='small' />
		</Box>
	);
}

/** "Offertum controleert" — the AI verifies this free-text condition at quote time (dashed = probabilistic). */
function AiConditionChip({ condition }: { condition: string }) {
	return (
		<Stack
			direction='row'
			useFlexGap
			spacing={0.75}
			title={`Offertum controleert deze conditie bij elke offerte: ${condition}`}
			sx={theme => ({
				display: 'inline-flex',
				alignItems: 'center',
				maxWidth: '100%',
				py: 0.5,
				pl: 1,
				pr: 1.25,
				borderRadius: `${theme.tokens.radius.sm}px`,
				color: theme.tokens.color.accent[700],
				backgroundColor: theme.tokens.color.accent[50],
				border: `1px dashed ${theme.tokens.color.accent[300]}`
			})}
		>
			<AppIcon name='sparkles' size='small' filled />
			<BodySmall fontWeight='medium' sx={{ fontSize: 12, color: 'inherit', flexShrink: 0 }}>
				Offertum controleert
			</BodySmall>
			<BodySmall
				sx={{
					fontSize: 12,
					color: 'inherit',
					fontStyle: 'italic',
					opacity: 0.85,
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					minWidth: 0
				}}
			>
				{condition}
			</BodySmall>
		</Stack>
	);
}

function ManualBadge() {
	return (
		<Stack
			direction='row'
			useFlexGap
			spacing={0.5}
			title='Door jou bewerkt — deze regel wordt niet overschreven door de automatische verwerking.'
			sx={theme => ({
				alignItems: 'center',
				py: 0.25,
				px: 0.75,
				borderRadius: `${theme.tokens.radius.sm}px`,
				backgroundColor: theme.tokens.color.paper3,
				border: `1px solid ${theme.tokens.color.line}`,
				color: theme.tokens.color.ink2
			})}
		>
			<AppIcon name='pen-line' size='small' />
			<BodySmall fontWeight='medium' sx={{ fontSize: 11, color: 'inherit' }}>
				Handmatig aangepast
			</BodySmall>
		</Stack>
	);
}

function EmptyRulesPanel({ everCompiled }: { everCompiled: boolean }) {
	return (
		<Box
			sx={theme => ({
				border: `1px dashed ${theme.tokens.color.lineStrong}`,
				borderRadius: `${theme.tokens.radius.md}px`,
				p: 4,
				textAlign: 'center',
				backgroundColor: theme.tokens.color.surface
			})}
		>
			<Box
				sx={theme => ({
					width: 40,
					height: 40,
					mx: 'auto',
					mb: 1.5,
					borderRadius: `${theme.tokens.radius.md}px`,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					backgroundColor: theme.tokens.color.paper2,
					color: theme.tokens.color.ink3
				})}
			>
				<AppIcon name={everCompiled ? 'search-off' : 'calculator'} size='medium' />
			</Box>
			<BodySmall fontWeight='medium' sx={{ display: 'block', mb: 0.5 }}>
				{everCompiled ? 'Geen prijsregels gevonden' : 'Nog geen regels'}
			</BodySmall>
			<BodySmall color='textSecondary' sx={{ display: 'block', maxWidth: 360, mx: 'auto', lineHeight: 1.55 }}>
				{everCompiled
					? 'Je tekst bevatte geen herkenbare prijsregels. Voeg een paar concrete tarieven toe, of kijk hieronder hoe anderen het opschrijven.'
					: 'Schrijf je prijsbeleid hierboven en klik op Opslaan — Offertum maakt de regels in de achtergrond.'}
			</BodySmall>
		</Box>
	);
}

/** "Verwerken mislukt" panel — compile errored after all retries. The text is safe; offers a manual
 * retry (re-saves the stored text to re-trigger the compile). */
function FailedRulesPanel({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
	return (
		<Box
			sx={theme => ({
				display: 'flex',
				alignItems: 'flex-start',
				gap: 1.5,
				p: 2.5,
				borderRadius: `${theme.tokens.radius.md}px`,
				backgroundColor: theme.tokens.color.lost[50],
				border: `1px solid ${theme.tokens.color.lost[500]}`
			})}
		>
			<Box sx={theme => ({ color: theme.tokens.color.lost[700], flexShrink: 0, mt: '1px' })}>
				<AppIcon name='alert-circle' size='medium' />
			</Box>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<BodySmall fontWeight='medium' sx={{ display: 'block', mb: 0.5 }}>
					Verwerken is even niet gelukt.
				</BodySmall>
				<BodySmall color='textSecondary' sx={{ display: 'block', mb: 1.5, lineHeight: 1.5 }}>
					Je tekst is veilig opgeslagen. We proberen het automatisch opnieuw — of probeer &apos;m zelf
					nogmaals.
				</BodySmall>
				<Button
					variant='contained'
					color='error'
					size='small'
					onClick={onRetry}
					disabled={isRetrying}
					startIcon={<AppIcon name='refresh' size='small' />}
				>
					{isRetrying ? 'Bezig…' : 'Probeer opnieuw'}
				</Button>
			</Box>
		</Box>
	);
}

/* ── Examples ── */

function ExamplesSection({ onUse }: { onUse: (body: string) => void }) {
	const [expanded, setExpanded] = useState<string | null>(null);

	// Matches the "Voorbeelden" panel on the Schrijfstijl page exactly: a bordered card with a
	// Playfair header, flat dividered rows, a LEFT chevron, and a "Gebruik als startpunt" button that
	// fills the editor. All accordion overrides live on the <Accordion> root (specificity 0,2,0) so
	// they beat the DS theme's nested summary styles — component-level sx would lose.
	return (
		<Paper variant='outlined' sx={{ p: 0, overflow: 'hidden' }}>
			<Box sx={{ py: 2, px: 3, borderBottom: theme => `1px solid ${theme.tokens.color.line}` }}>
				<H3 component='h2' fontWeight='medium' sx={{ fontSize: 16 }}>
					Voorbeelden
				</H3>
				<BodySmall color='textSecondary' sx={{ display: 'block', mt: 0.5, fontSize: 12 }}>
					Klik op een voorbeeld om &apos;m te bekijken. Je kunt &apos;m overnemen als startpunt en aanpassen.
				</BodySmall>
			</Box>
			{EXAMPLES.map(example => {
				const open = expanded === example.title;
				return (
					<Accordion
						key={example.title}
						disableGutters
						square
						elevation={0}
						expanded={open}
						onChange={(_event, isOpen) => setExpanded(isOpen ? example.title : null)}
						sx={theme => ({
							border: 'none',
							borderRadius: 0,
							boxShadow: 'none',
							backgroundColor: 'transparent',
							borderTop: `1px solid ${theme.tokens.color.line}`,
							'&:first-of-type': { borderTop: 'none' },
							'&::before': { display: 'none' },
							'&.Mui-expanded': { margin: 0 },
							'& .MuiAccordionSummary-root': {
								padding: theme.spacing(0, 3),
								minHeight: 0,
								backgroundColor: 'transparent',
								// Chevron on the left; keep our own right→down glyph (cancel MUI's 180° flip).
								flexDirection: 'row-reverse',
								gap: theme.spacing(1.25),
								'&:hover': { backgroundColor: theme.tokens.color.paper2 },
								'&.Mui-focusVisible': { backgroundColor: 'transparent' }
							},
							'& .MuiAccordionSummary-expandIconWrapper': {
								color: theme.tokens.color.ink3,
								transform: 'none'
							},
							'& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': { transform: 'none' },
							'& .MuiAccordionSummary-content': {
								margin: theme.spacing(1.5, 0),
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								flexWrap: 'nowrap',
								gap: theme.spacing(1),
								fontSize: 14,
								fontWeight: 'medium',
								color: theme.tokens.color.ink2
							},
							'& .MuiAccordionDetails-root': {
								padding: theme.spacing(0, 3, 2, 7),
								borderTop: 'none'
							}
						})}
					>
						<AccordionSummary
							expandIcon={<AppIcon name={open ? 'chevron-down' : 'chevron-right'} size='small' />}
						>
							<Box component='span' sx={{ minWidth: 0 }}>
								{example.title}
							</Box>
							<Fade in={open}>
								<Button
									component='span'
									size='small'
									variant='contained'
									onClick={event => {
										event.stopPropagation();
										onUse(example.body);
										setExpanded(null);

										// scroll to the top of the editor so the user sees the pasted text immediately
										const editor = document.getElementById('playbook-textarea');
										if (editor) {
											editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
										}
									}}
								>
									Gebruik als startpunt
								</Button>
							</Fade>
						</AccordionSummary>
						<AccordionDetails sx={{ mt: 1 }}>
							<BodySmall
								component='pre'
								color='textSecondary'
								sx={{ m: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.55 }}
							>
								{example.body}
							</BodySmall>
						</AccordionDetails>
					</Accordion>
				);
			})}
		</Paper>
	);
}

/* ── Edit modal (reused from the card version) ── */

function RuleEditDialog({ rule, onClose }: { rule: PricingRule | null; onClose: () => void }) {
	const update = useUpdatePricingRule();
	const toast = useToast();

	const onSubmit = (values: PricingRuleEditForm) => {
		if (!rule) {
			return;
		}
		const trimmedNarrative = values.conditionNarrative.trim();
		update.mutate(
			{
				id: rule.id,
				description: values.description,
				priority: values.priority,
				active: values.active,
				// Preserve the rest of the effect blob and only swap in the new numeric value.
				effect: { ...rule.effect, value: values.value },
				conditionNarrative: trimmedNarrative.length > 0 ? trimmedNarrative : null
			},
			{
				onSuccess: () => onClose(),
				onError: error =>
					toast.error('Opslaan mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.')
			}
		);
	};

	const meta = rule ? RULE_TYPE_META[rule.ruleType] : null;

	return (
		<Dialog
			open={rule !== null}
			title={
				<Stack direction='row' useFlexGap spacing={1.25} sx={{ alignItems: 'center' }}>
					{meta && <TypeBadge icon={meta.icon} />}
					Regel bewerken
					{meta && (
						<BodySmall color='textSecondary' sx={{ fontSize: 14 }}>
							· {meta.label}
						</BodySmall>
					)}
				</Stack>
			}
			onClose={onClose}
			width={600}
			action={
				<>
					<Button onClick={onClose}>Annuleren</Button>
					<Button type='submit' form='pricing-rule-edit-form' variant='contained' disabled={update.isPending}>
						{update.isPending ? 'Opslaan…' : 'Opslaan'}
					</Button>
				</>
			}
		>
			{rule && (
				<Form<PricingRuleEditForm>
					key={rule.id}
					id='pricing-rule-edit-form'
					action={onSubmit}
					schema={PricingRuleEditSchema}
					defaultValues={{
						description: rule.description,
						value: typeof rule.effect.value === 'number' ? rule.effect.value : 0,
						priority: rule.priority,
						active: rule.active,
						conditionNarrative: rule.conditionNarrative ?? ''
					}}
				>
					<Stack useFlexGap spacing={3} sx={{ pt: 1 }}>
						<Field name='description' label='Omschrijving' fullWidth />
						<Field
							name='value'
							type='number'
							label={effectUnitFor(rule.effect) ? `Waarde (${effectUnitFor(rule.effect)})` : 'Waarde'}
							fullWidth
						/>
						<Field
							name='priority'
							type='number'
							label='Prioriteit (0-1000)'
							helperText='Hogere prioriteit wint van regels met dezelfde voorwaarde. Standaard is 100.'
							fullWidth
						/>
						<Field
							name='conditionNarrative'
							label='Offertum-conditie'
							helperText='Vrije tekst waaraan Offertum elke offerte toetst voordat de regel wordt toegepast, bv. "renovaties van woningen ouder dan 2 jaar". Laat leeg als de structuurregel boven al voldoende is.'
							fullWidth
							multiline
							minRows={2}
							maxRows={4}
							maxLength={500}
						/>
						<FormSwitch name='active' label='Actief' />
					</Stack>
				</Form>
			)}
		</Dialog>
	);
}

/** Human-readable unit hint for the effect's `value` field, used as the input label suffix. */
function effectUnitFor(effect: PricingRuleJsonObject): string | null {
	if (!isPricingEffectType(effect.type)) {
		return null;
	}
	switch (effect.type) {
		case 'rate_eur_per_hour':
			return '€ per uur';
		case 'markup_percent':
		case 'surcharge_percent':
		case 'discount_percent':
		case 'vat_rate':
			return '%';
		case 'flat_fee_eur':
		case 'discount_eur':
		case 'minimum_eur':
			return '€';
		case 'per_km_eur':
			return '€ per km';
	}
}

function summarizeEffect(effect: PricingRuleJsonObject): string {
	if (!isPricingEffectType(effect.type)) {
		return typeof effect.type === 'string' ? effect.type : 'onbekend';
	}

	const value = effect.value;
	if (typeof value !== 'number') {
		return effect.type;
	}

	switch (effect.type) {
		case 'rate_eur_per_hour':
			return `€ ${value}/uur`;
		case 'markup_percent':
		case 'surcharge_percent':
			return `+ ${value}%`;
		case 'discount_percent':
			return `− ${value}%`;
		case 'vat_rate':
			return `${value}%`;
		case 'flat_fee_eur':
		case 'minimum_eur':
			return `€ ${value}`;
		case 'discount_eur':
			return `− € ${value}`;
		case 'per_km_eur':
			return `€ ${value}/km`;
	}
}

function summarizeCondition(condition: Record<string, unknown>): ReactNode {
	const parts: string[] = [];
	if (typeof condition.category === 'string') {
		parts.push(`categorie: ${condition.category}`);
	}
	if (typeof condition.urgency === 'string') {
		parts.push(`urgentie: ${condition.urgency}`);
	}
	if (typeof condition.jurisdiction === 'string') {
		parts.push(`gebied: ${condition.jurisdiction}`);
	}
	if (typeof condition.lineKind === 'string') {
		parts.push(`type: ${condition.lineKind}`);
	}
	return parts.length > 0 ? parts.join(' · ') : null;
}
