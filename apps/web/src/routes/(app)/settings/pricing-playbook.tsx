import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { Switch as FormSwitch } from '@/components/Form/Switch/Switch.component';
import { SectionError } from '@/components/SectionError.component';
import {
	pricingPlaybookQueryOptions,
	pricingRulesQueryOptions,
	useDeletePricingRule,
	useUpdatePricingPlaybook,
	useUpdatePricingRule
} from '@/lib/queries/pricing-playbook.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { PricingPlaybookSchema, type PricingPlaybookForm } from '@/lib/schemas/pricing-playbook.schema';
import { PricingRuleEditSchema, type PricingRuleEditForm } from '@/lib/schemas/pricing-rule-edit.schema';
import { toReadableTimestamp } from '@/lib/utils/date.utils';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { PRICING_PLAYBOOK_TEXT_MAX_LENGTH, type PricingRule, type PricingRuleType } from '@quoteom/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

/**
 * Pricing playbook editor — free-form prose the LLM compile pass turns into typed
 * pricing rules (W11.3). Owner-only at the route level mirroring the same gate
 * `/settings/follow-ups` uses; members get bounced to `/settings/email` so they
 * don't see a page that won't accept their writes.
 */
export const Route = createFileRoute('/(app)/settings/pricing-playbook')({
	beforeLoad: async ({ context }) => {
		const me = await context.queryClient.ensureQueryData(myMembershipQueryOptions);
		if (me.role !== 'OWNER') {
			throw redirect({ to: '/settings/email' });
		}
	},
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(pricingPlaybookQueryOptions),
			context.queryClient.ensureQueryData(pricingRulesQueryOptions)
		]);
	},
	component: PricingPlaybookSettingsPage,
	errorComponent: SectionError
});

const EXAMPLES = [
	{
		title: 'Voorbeeld — generieke MKB',
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
		title: 'Voorbeeld — dienstverlener',
		body: [
			'Mijn uurtarief is € 95 per uur voor consultancy, € 65 voor administratieve werkzaamheden.',
			'Voor projecten boven de € 5.000 geef ik 5% korting.',
			'BTW: 21%.',
			'Voor klanten in België reken ik BTW verlegd.'
		].join('\n')
	},
	{
		title: 'Voorbeeld — vakman',
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
	const { data } = useSuspenseQuery(pricingPlaybookQueryOptions);
	const update = useUpdatePricingPlaybook();
	const [savedFlash, setSavedFlash] = useState(false);

	const onSubmit = (values: PricingPlaybookForm) => {
		update.mutate(
			{ playbookText: values.playbookText },
			{
				onSuccess: () => {
					setSavedFlash(true);
					window.setTimeout(() => setSavedFlash(false), 2500);
				}
			}
		);
	};

	// Compile-state pill: three states.
	//   - `Compiling…`     when text was saved but `compiledAt` hasn't caught up yet
	//                      (`updatedAt > compiledAt` OR `compiledAt === null && text exists`)
	//   - `X regels`       when the compile pass has run and rules exist
	//   - `Nog niet gevuld` when the playbook is empty
	const hasText = data.playbookText.trim().length > 0;
	const compileBehind = data.compiledAt === null ? hasText : data.compiledAt < data.updatedAt;
	const compileStatus: { label: string; color: 'default' | 'info' | 'success' } = !hasText
		? { label: 'Nog niet gevuld', color: 'default' }
		: compileBehind
			? { label: 'Regels worden bijgewerkt…', color: 'info' }
			: { label: `${data.rulesCount} regel${data.rulesCount === 1 ? '' : 's'} gevonden`, color: 'success' };

	return (
		<Container maxWidth='md' sx={{ py: 6 }}>
			<Box sx={{ mb: 'var(--space-6)' }}>
				<Typography variant='h1' sx={{ fontSize: '2.25rem', mb: 'var(--space-2)' }}>
					Prijsregels
				</Typography>
				<Typography sx={{ color: 'var(--ink-3)', fontSize: 14, maxWidth: 640 }}>
					Beschrijf hoe je je prijzen bepaalt — in je eigen woorden, geen vaste vorm. Quoteom leest je tekst
					en vertaalt 'm naar regels die je offertes automatisch invullen. De voorbeelden hieronder helpen je
					op weg.
				</Typography>
			</Box>

			<Paper
				variant='outlined'
				sx={{
					padding: 'var(--space-6)',
					borderRadius: 'var(--radius-md)',
					boxShadow: 'var(--shadow-1)',
					background: 'var(--surface)'
				}}
			>
				<Stack spacing='var(--space-5)'>
					<Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
						<Chip size='small' label={compileStatus.label} color={compileStatus.color} variant='outlined' />
						{data.compiledAt && (
							<Typography variant='caption' color='text.secondary'>
								· Laatst verwerkt {toReadableTimestamp(data.compiledAt)}
							</Typography>
						)}
					</Stack>

					<Form<PricingPlaybookForm>
						action={onSubmit}
						schema={PricingPlaybookSchema}
						defaultValues={{ playbookText: data.playbookText }}
					>
						<Stack spacing='var(--space-4)'>
							<Alert severity='info' variant='outlined' sx={{ alignItems: 'flex-start' }}>
								<strong>Tip:</strong> schrijf elke prijsregel op een eigen regel of in een eigen zin.
								Eén uitspraak per regel maakt het makkelijker voor Quoteom om je tekst correct te
								vertalen naar losse regels.{' '}
								<em>Bijv. "€ 85/uur voor loodgieterswerk en € 95 voor elektra"</em> werkt — maar twee
								aparte regels geven beter resultaat.
							</Alert>
							<Field
								name='playbookText'
								type='text'
								multiline
								minRows={10}
								maxRows={30}
								fullWidth
								maxLength={PRICING_PLAYBOOK_TEXT_MAX_LENGTH}
								placeholder={[
									'Bijvoorbeeld:',
									'Mijn standaard uurtarief is € 75 per uur.',
									'Voor loodgieterswerk reken ik € 95 per uur.',
									'BTW is 21%.',
									'Voor spoedklussen reken ik 25% extra.'
								].join('\n')}
							/>

							{update.error && (
								<Alert severity='error'>
									{update.error instanceof Error ? update.error.message : 'Opslaan mislukt.'}
								</Alert>
							)}
							{savedFlash && (
								<Alert severity='success'>
									Opgeslagen. Regels worden in de achtergrond bijgewerkt.
								</Alert>
							)}

							<Stack direction='row' spacing={1} sx={{ justifyContent: 'flex-end' }}>
								<Button type='submit' variant='contained' disabled={update.isPending}>
									{update.isPending ? 'Opslaan…' : 'Opslaan'}
								</Button>
							</Stack>
						</Stack>
					</Form>
				</Stack>
			</Paper>

			<CompiledRulesPanel />

			<Box sx={{ mt: 'var(--space-6)' }}>
				<Typography
					variant='overline'
					sx={{ color: 'var(--ink-3)', fontSize: 11, display: 'block', mb: 'var(--space-2)' }}
				>
					Voorbeelden
				</Typography>
				<Typography sx={{ color: 'var(--ink-3)', fontSize: 13, mb: 'var(--space-3)' }}>
					Klik open om te zien hoe andere ondernemers hun prijsregels in eigen woorden hebben opgeschreven.
				</Typography>
				<Stack spacing={1}>
					{EXAMPLES.map(example => (
						<Accordion key={example.title} variant='outlined' disableGutters>
							<AccordionSummary sx={{ '& .MuiAccordionSummary-content': { my: 1 } }}>
								<Typography variant='body2' sx={{ fontWeight: 500 }}>
									{example.title}
								</Typography>
							</AccordionSummary>
							<AccordionDetails sx={{ pt: 0 }}>
								<Typography
									variant='body2'
									component='pre'
									sx={{
										whiteSpace: 'pre-wrap',
										fontFamily: 'inherit',
										m: 0,
										color: 'text.secondary'
									}}
								>
									{example.body}
								</Typography>
							</AccordionDetails>
						</Accordion>
					))}
				</Stack>
			</Box>
		</Container>
	);
}

const RULE_TYPE_LABELS_NL: Record<PricingRuleType, string> = {
	hourly_rate: 'Uurtarief',
	material_markup: 'Materiaalopslag',
	vat: 'BTW',
	travel: 'Reiskosten',
	urgency: 'Spoedtoeslag',
	discount: 'Korting',
	minimum_order: 'Minimumorder'
};

/**
 * Card list under the editor. Renders compiled + manually-added rules with
 * inline toggle (active), delete, and edit affordance. Rules carrying a
 * `conditionNarrative` show an "AI-controleert" badge + the narrative text —
 * the AI verifies at quote time whether the narrative applies to the incoming
 * opportunity before committing the rule's effect.
 */
function CompiledRulesPanel() {
	const { data: rulesResponse } = useSuspenseQuery(pricingRulesQueryOptions);
	const rules = rulesResponse.rules;

	if (rules.length === 0) {
		return (
			<Box sx={{ mt: 'var(--space-6)' }}>
				<Typography
					variant='overline'
					sx={{ color: 'var(--ink-3)', fontSize: 11, display: 'block', mb: 'var(--space-2)' }}
				>
					Regels
				</Typography>
				<Typography sx={{ color: 'var(--ink-3)', fontSize: 13 }}>
					Nog geen regels. Sla je tekst hierboven op — Quoteom maakt de regels in de achtergrond.
				</Typography>
			</Box>
		);
	}

	return (
		<Box sx={{ mt: 'var(--space-6)' }}>
			<Typography
				variant='overline'
				sx={{ color: 'var(--ink-3)', fontSize: 11, display: 'block', mb: 'var(--space-2)' }}
			>
				Regels ({rules.filter(r => r.active).length} actief, {rules.length} totaal)
			</Typography>
			<Stack spacing={1}>
				{rules.map(rule => (
					<RuleCard key={rule.id} rule={rule} />
				))}
			</Stack>
		</Box>
	);
}

function RuleCard({ rule }: { rule: PricingRule }) {
	const update = useUpdatePricingRule();
	const remove = useDeletePricingRule();
	const [editOpen, setEditOpen] = useState(false);

	const effectSummary = summarizeEffect(rule.effect);
	const conditionSummary = summarizeCondition(rule.condition);

	return (
		<Paper variant='outlined' sx={{ p: 'var(--space-3)', opacity: rule.active ? 1 : 0.55 }}>
			<Stack direction='row' spacing={1} sx={{ alignItems: 'flex-start' }}>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Stack direction='row' spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
						<Chip
							size='small'
							label={RULE_TYPE_LABELS_NL[rule.ruleType]}
							color='default'
							variant='outlined'
						/>
						{rule.manualOverride && (
							<Chip
								size='small'
								label='Handmatig aangepast'
								color='info'
								variant='outlined'
								title='Deze regel is door jou bewerkt en wordt niet overschreven door de automatische verwerking.'
							/>
						)}
						{!rule.active && <Chip size='small' label='Inactief' variant='outlined' />}
					</Stack>
					<Typography variant='body2' sx={{ fontWeight: 500, mt: 0.5 }}>
						{rule.description}
					</Typography>
					<Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.5 }}>
						{effectSummary}
						{conditionSummary && ` · ${conditionSummary}`}
					</Typography>
					{rule.conditionNarrative && (
						<Tooltip
							title='Bij elke offerte controleert de AI of deze conditie van toepassing is op de aanvraag. Alleen dan past de regel toe.'
							arrow
						>
							<Stack
								direction='row'
								spacing={0.5}
								sx={{ alignItems: 'center', mt: 1, flexWrap: 'wrap', rowGap: 0.5 }}
							>
								<Chip size='small' label='AI-controleert' color='warning' variant='outlined' />
								<Typography variant='caption' color='text.secondary' sx={{ fontStyle: 'italic' }}>
									"{rule.conditionNarrative}"
								</Typography>
							</Stack>
						</Tooltip>
					)}
				</Box>
				<Stack direction='row' spacing={0.5} sx={{ flexShrink: 0, alignItems: 'center' }}>
					<Tooltip title='Bewerken'>
						<IconButton
							size='small'
							onClick={() => setEditOpen(true)}
							sx={{ fontSize: '1rem' }}
							aria-label='Bewerken'
						>
							✎
						</IconButton>
					</Tooltip>
					<Tooltip title={rule.active ? 'Regel uitschakelen' : 'Regel inschakelen'}>
						<Switch
							size='small'
							checked={rule.active}
							onChange={e => update.mutate({ id: rule.id, active: e.target.checked })}
							disabled={update.isPending}
						/>
					</Tooltip>
					<Tooltip title='Verwijderen'>
						<IconButton
							size='small'
							onClick={() => {
								if (window.confirm(`Regel "${rule.description}" verwijderen?`)) {
									remove.mutate(rule.id);
								}
							}}
							disabled={remove.isPending}
							sx={{ fontSize: '1.1rem' }}
							aria-label='Verwijderen'
						>
							✕
						</IconButton>
					</Tooltip>
				</Stack>
			</Stack>
			<RuleEditDialog rule={rule} open={editOpen} onClose={() => setEditOpen(false)} />
		</Paper>
	);
}

function RuleEditDialog({ rule, open, onClose }: { rule: PricingRule; open: boolean; onClose: () => void }) {
	const update = useUpdatePricingRule();

	// Read the current effect value (the most owner-tweaked field) from the
	// existing blob so the form pre-fills it. Falls back to 0 if the LLM emitted
	// a non-numeric value somehow (shouldn't happen — the Zod schema rejects it
	// at compile time).
	const currentValue = typeof rule.effect.value === 'number' ? rule.effect.value : 0;

	const onSubmit = (values: PricingRuleEditForm) => {
		const trimmedNarrative = values.conditionNarrative.trim();
		update.mutate(
			{
				id: rule.id,
				description: values.description,
				priority: values.priority,
				active: values.active,
				// Preserve the rest of the effect blob (type + freeUnderKm + anything
				// else) and only swap in the new numeric value.
				effect: { ...rule.effect, value: values.value },
				conditionNarrative: trimmedNarrative.length > 0 ? trimmedNarrative : null
			},
			{
				onSuccess: () => onClose()
			}
		);
	};

	const effectUnit = effectUnitFor(rule.effect);

	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
			<DialogTitle>Regel bewerken</DialogTitle>
			<Form<PricingRuleEditForm>
				action={onSubmit}
				schema={PricingRuleEditSchema}
				defaultValues={{
					description: rule.description,
					value: currentValue,
					priority: rule.priority,
					active: rule.active,
					conditionNarrative: rule.conditionNarrative ?? ''
				}}
			>
				<DialogContent>
					<Stack spacing='var(--space-3)' sx={{ pt: 1 }}>
						<Field name='description' label='Omschrijving' fullWidth />
						<Field
							name='value'
							type='number'
							label={effectUnit ? `Waarde (${effectUnit})` : 'Waarde'}
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
							label='AI-conditie (optioneel)'
							helperText='Vrije tekst waaraan de AI elke offerte toetst voordat de regel wordt toegepast — bv. "renovaties van woningen ouder dan 2 jaar". Laat leeg als de structuurregel boven al voldoende is.'
							fullWidth
							multiline
							minRows={2}
							maxRows={4}
							maxLength={500}
						/>
						<FormSwitch name='active' label='Actief' />
						{update.error && (
							<Alert severity='error'>
								{update.error instanceof Error ? update.error.message : 'Opslaan mislukt.'}
							</Alert>
						)}
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button onClick={onClose}>Annuleren</Button>
					<Button type='submit' variant='contained' disabled={update.isPending}>
						{update.isPending ? 'Opslaan…' : 'Opslaan'}
					</Button>
				</DialogActions>
			</Form>
		</Dialog>
	);
}

/** Human-readable unit hint for the effect's `value` field, used as the input
 * label suffix in the edit modal. Best-effort — returns null for shapes we
 * haven't classified yet. */
function effectUnitFor(effect: Record<string, unknown>): string | null {
	if (typeof effect.type !== 'string') {
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
		default:
			return null;
	}
}

function summarizeEffect(effect: Record<string, unknown>): string {
	const type = typeof effect.type === 'string' ? effect.type : 'unknown';
	const value = effect.value;
	if (typeof value !== 'number') {
		return type;
	}
	switch (type) {
		case 'rate_eur_per_hour':
			return `€${value}/uur`;
		case 'markup_percent':
		case 'surcharge_percent':
		case 'discount_percent':
			return `${value}%`;
		case 'vat_rate':
			return `BTW ${value}%`;
		case 'flat_fee_eur':
		case 'discount_eur':
		case 'minimum_eur':
			return `€${value}`;
		case 'per_km_eur':
			return `€${value}/km`;
		default:
			return `${type}: ${value}`;
	}
}

function summarizeCondition(condition: Record<string, unknown>): string | null {
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
