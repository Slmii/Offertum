import { StandaloneField } from '@/components/Form/Field/Field.component';
import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import {
	quoteDraftsQueryOptions,
	useAddQuoteLineItem,
	useDeleteQuoteLineItem,
	useGenerateQuoteDraft,
	useGenerateQuotePreview,
	useReplaceQuoteLines,
	useUpdateQuoteLineItem
} from '@/lib/queries/quote-drafts.queries';
import { toReadableEuro } from '@/lib/utils/number.utils';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import {
	computeQuoteTotals,
	lineNetCents,
	type ProposedQuoteLine,
	type QuoteDraft,
	type QuoteLineItem,
	type QuoteVatBracketTotal,
	type ReplaceQuoteLineInput
} from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

const MONEY_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;
const QUANTITY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

const SOURCE_LABELS_NL: Record<QuoteLineItem['source'], string> = {
	catalog_match: 'Catalogus',
	rule_applied: 'Prijsregel',
	inferred: 'AI'
};

const VAT_OPTIONS = [
	{ id: '21', label: '21%' },
	{ id: '9', label: '9%' },
	{ id: '0', label: '0%' },
	{ id: 'verlegd', label: 'BTW verlegd' }
];

/**
 * W10.3 quote section on the opportunity detail page. Generates a quote draft on
 * demand (W10.1/W10.2), then renders an editable line-item table with live
 * per-BTW-bracket totals. Every number is owner-editable; prices/quantities are
 * decimal strings end-to-end and totals are computed by the shared cents-based
 * `computeQuoteTotals` so the figure here matches the PDF exactly.
 */
export function QuotePanel({ opportunityId }: { opportunityId: string }) {
	const { data } = useSuspenseQuery(quoteDraftsQueryOptions(opportunityId));
	const generate = useGenerateQuoteDraft(opportunityId);
	const preview = useGenerateQuotePreview(opportunityId);
	const [regenerateOpen, setRegenerateOpen] = useState(false);

	const latest = data.drafts[0] ?? null;
	// `updatedAt` bumps when the lines are (re)generated, so this resets after a
	// regenerate-apply. ISO-UTC strings compare lexicographically → SSR-safe (no Date/locale).
	const pricingStale = latest !== null && data.pricingUpdatedAt !== null && data.pricingUpdatedAt > latest.updatedAt;

	const openRegenerate = () => preview.mutate(undefined, { onSuccess: () => setRegenerateOpen(true) });

	return (
		<Box sx={{ mt: 4 }}>
			<Stack
				direction='row'
				useFlexGap
				spacing={1}
				sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
			>
				<Typography variant='h2' sx={{ fontSize: 18 }}>
					Offerte
				</Typography>
				{latest && (
					<Button
						size='small'
						variant='outlined'
						onClick={openRegenerate}
						disabled={preview.isPending}
						startIcon={preview.isPending ? <CircularProgress size={14} /> : null}
					>
						{preview.isPending ? 'Bezig…' : 'Opnieuw genereren'}
					</Button>
				)}
			</Stack>

			{generate.isError && (
				<Alert severity='error' sx={{ mb: 1 }}>
					Offerte opstellen mislukt:{' '}
					{generate.error instanceof Error ? generate.error.message : 'Onbekende fout'}
				</Alert>
			)}
			{preview.isError && (
				<Alert severity='error' sx={{ mb: 1 }}>
					Nieuw voorstel maken mislukt:{' '}
					{preview.error instanceof Error ? preview.error.message : 'Onbekende fout'}
				</Alert>
			)}
			{pricingStale && (
				<Alert
					severity='info'
					sx={{ mb: 1 }}
					action={
						<Button color='inherit' size='small' onClick={openRegenerate} disabled={preview.isPending}>
							Opnieuw genereren
						</Button>
					}
				>
					Je prijsregels zijn bijgewerkt sinds deze offerte werd opgesteld. Wil je de offerte opnieuw laten
					genereren met de nieuwe prijzen?
				</Alert>
			)}

			{latest ? (
				<QuoteDraftEditor draft={latest} opportunityId={opportunityId} />
			) : (
				<Paper variant='outlined' sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
					<Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
						Nog geen offerte opgesteld. Stel automatisch regels voor op basis van de aanvraag, je catalogus
						en je prijsregels.
					</Typography>
					<Button
						variant='contained'
						onClick={() => generate.mutate()}
						disabled={generate.isPending}
						startIcon={generate.isPending ? <CircularProgress size={14} /> : null}
					>
						{generate.isPending ? 'Bezig…' : 'Genereer offerte'}
					</Button>
				</Paper>
			)}

			{latest && regenerateOpen && preview.data && (
				<QuoteRegenerateModal
					opportunityId={opportunityId}
					draft={latest}
					proposed={preview.data.lines}
					onClose={() => setRegenerateOpen(false)}
				/>
			)}
		</Box>
	);
}

type QuoteLineDiffStatus = 'unchanged' | 'changed' | 'new' | 'removed';

interface QuoteLineDiffEntry {
	key: string;
	status: QuoteLineDiffStatus;
	/** Rule-derived line (spoedtoeslag/voorrijkosten/minimum) — auto-recalculated. */
	isRule: boolean;
	current: QuoteLineItem | null;
	proposed: ProposedQuoteLine | null;
}

/**
 * Regenerate diff modal. Matches the current draft against a fresh proposal and shows
 * one row per logical line — ongewijzigd / gewijzigd / nieuw / vervalt — so a line
 * never appears twice. The owner decides per line; rule-derived lines (toeslagen,
 * voorrijkosten, minimum) are always recalculated and shown read-only. Manually edited
 * lines default to "keep" so owner work isn't silently overwritten.
 */
function QuoteRegenerateModal({
	opportunityId,
	draft,
	proposed,
	onClose
}: {
	opportunityId: string;
	draft: QuoteDraft;
	proposed: ProposedQuoteLine[];
	onClose: () => void;
}) {
	const replace = useReplaceQuoteLines(opportunityId);
	const entries = useMemo(() => diffQuoteLines(draft.lineItems, proposed), [draft.lineItems, proposed]);

	// Per-entry selection. For `changed`: true = take new, false = keep current.
	// For `new`: true = add. For `removed`: true = keep. `unchanged` is always kept.
	const [selection, setSelection] = useState<Record<string, boolean>>(() =>
		Object.fromEntries(entries.map(entry => [entry.key, defaultSelection(entry)]))
	);
	const setKey = (key: string, value: boolean) => setSelection(prev => ({ ...prev, [key]: value }));

	const lineEntries = entries.filter(entry => !entry.isRule);
	const ruleEntries = entries.filter(entry => entry.isRule);
	const resultLines = buildResultLines(lineEntries, ruleEntries, selection);

	return (
		<Dialog open onClose={onClose} maxWidth='md' fullWidth>
			<DialogTitle>Offerte opnieuw genereren</DialogTitle>
			<DialogContent dividers>
				<Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
					Vergelijk je huidige offerte met het nieuwe voorstel en kies per regel wat er gebeurt. Toeslagen en
					voorrijkosten worden automatisch opnieuw berekend.
				</Typography>

				<Typography variant='subtitle2' sx={{ mb: 1 }}>
					Werk &amp; materialen
				</Typography>
				<Stack useFlexGap spacing={1}>
					{lineEntries.length === 0 && (
						<Typography variant='body2' color='text.secondary'>
							Geen werk- of materiaalregels.
						</Typography>
					)}
					{lineEntries.map(entry => (
						<QuoteDiffRow
							key={entry.key}
							entry={entry}
							checked={selection[entry.key] ?? false}
							onChange={value => setKey(entry.key, value)}
						/>
					))}
				</Stack>

				{ruleEntries.length > 0 && (
					<>
						<Divider sx={{ my: 2 }} />
						<Typography variant='subtitle2' sx={{ mb: 1 }}>
							Automatisch herberekend (prijsregels)
						</Typography>
						<Stack useFlexGap spacing={0.5}>
							{ruleEntries.map(entry => (
								<RuleDiffRow key={entry.key} entry={entry} />
							))}
						</Stack>
					</>
				)}

				{replace.isError && (
					<Alert severity='error' sx={{ mt: 2 }}>
						Toepassen mislukt: {replace.error instanceof Error ? replace.error.message : 'Onbekende fout'}
					</Alert>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={replace.isPending}>
					Annuleren
				</Button>
				<Button
					variant='contained'
					onClick={() =>
						replace.mutate({ quoteDraftId: draft.id, lines: resultLines }, { onSuccess: onClose })
					}
					disabled={replace.isPending || resultLines.length === 0}
					startIcon={replace.isPending ? <CircularProgress size={14} /> : null}
				>
					Toepassen ({resultLines.length})
				</Button>
			</DialogActions>
		</Dialog>
	);
}

const DIFF_CHIP: Record<QuoteLineDiffStatus, { label: string; color: 'default' | 'success' | 'warning' | 'info' }> = {
	unchanged: { label: 'Ongewijzigd', color: 'default' },
	changed: { label: 'Gewijzigd', color: 'warning' },
	new: { label: 'Nieuw', color: 'success' },
	removed: { label: 'Vervalt', color: 'info' }
};

function QuoteDiffRow({
	entry,
	checked,
	onChange
}: {
	entry: QuoteLineDiffEntry;
	checked: boolean;
	onChange: (value: boolean) => void;
}) {
	const chip = (
		<Chip
			size='small'
			variant='outlined'
			color={DIFF_CHIP[entry.status].color}
			label={DIFF_CHIP[entry.status].label}
		/>
	);

	if (entry.status === 'unchanged' && entry.proposed) {
		return (
			<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center', pl: '11px' }}>
				{chip}
				<LineSummary line={entry.proposed} />
			</Stack>
		);
	}

	if (entry.status === 'changed' && entry.current && entry.proposed) {
		return (
			<Box>
				<FormControlLabel
					control={<Checkbox size='small' checked={checked} onChange={e => onChange(e.target.checked)} />}
					label={
						<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
							{chip}
							<Typography variant='body2'>{entry.proposed.description}</Typography>
						</Stack>
					}
				/>
				<Typography variant='caption' color='text.secondary' sx={{ display: 'block', pl: '30px' }}>
					huidig: {summarize(entry.current.quantity, entry.current.unitPriceEur)} → nieuw:{' '}
					{summarize(String(entry.proposed.quantity), entry.proposed.unitPriceEur)} ·{' '}
					{checked ? 'nieuwe regel gebruiken' : 'huidige regel behouden'}
				</Typography>
			</Box>
		);
	}

	if (entry.status === 'new' && entry.proposed) {
		return (
			<FormControlLabel
				control={<Checkbox size='small' checked={checked} onChange={e => onChange(e.target.checked)} />}
				label={
					<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
						{chip}
						<LineSummary line={entry.proposed} />
					</Stack>
				}
			/>
		);
	}

	if (entry.status === 'removed' && entry.current) {
		return (
			<FormControlLabel
				control={<Checkbox size='small' checked={checked} onChange={e => onChange(e.target.checked)} />}
				label={
					<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
						{chip}
						<LineSummary line={entry.current} />
						<Typography variant='caption' color='text.secondary'>
							(behouden?)
						</Typography>
					</Stack>
				}
			/>
		);
	}

	return null;
}

function RuleDiffRow({ entry }: { entry: QuoteLineDiffEntry }) {
	if (!entry.proposed) {
		return (
			<Typography variant='body2' color='text.secondary'>
				{entry.current?.description} — vervalt
			</Typography>
		);
	}
	const changed = entry.current !== null && !sameLine(entry.current, entry.proposed);
	return (
		<Typography variant='body2'>
			{entry.proposed.description} · {summarize(String(entry.proposed.quantity), entry.proposed.unitPriceEur)}
			{changed && entry.current && (
				<Typography component='span' variant='caption' color='text.secondary'>
					{' '}
					(was {formatLinePrice(entry.current.unitPriceEur)})
				</Typography>
			)}
		</Typography>
	);
}

function LineSummary({ line }: { line: QuoteLineItem | ProposedQuoteLine }) {
	return (
		<Typography variant='body2'>
			{line.description}{' '}
			<Typography component='span' variant='caption' color='text.secondary'>
				· {summarize(String(line.quantity), line.unitPriceEur)}
			</Typography>
		</Typography>
	);
}

function summarize(quantity: string, unitPriceEur: string | null): string {
	return `${quantity} × ${formatLinePrice(unitPriceEur)}`;
}

function formatLinePrice(unitPriceEur: string | null): string {
	return unitPriceEur === null ? 'prijs n.t.b.' : toReadableEuro(Number(unitPriceEur));
}

/** Stable identity for matching a line across a regenerate: catalog item, then
 * pricing rule, else the (normalized) description for inferred work. */
function lineKey(
	source: string,
	catalogItemId: string | null,
	appliedRuleId: string | null,
	description: string
): string {
	if (source === 'catalog_match' && catalogItemId) {
		return `c:${catalogItemId}`;
	}
	if (source === 'rule_applied' && appliedRuleId) {
		return `r:${appliedRuleId}`;
	}
	return `i:${description.trim().toLowerCase()}`;
}

function sameLine(current: QuoteLineItem, proposed: ProposedQuoteLine): boolean {
	return (
		Number(current.quantity) === proposed.quantity &&
		current.unitPriceEur === proposed.unitPriceEur &&
		current.vatRate === proposed.vatRate &&
		!current.vatReverseCharged
	);
}

function diffQuoteLines(current: QuoteLineItem[], proposed: ProposedQuoteLine[]): QuoteLineDiffEntry[] {
	const currentByKey = new Map<string, QuoteLineItem>();
	for (const line of current) {
		currentByKey.set(lineKey(line.source, line.catalogItemId, line.appliedRuleId, line.description), line);
	}
	const proposedByKey = new Map<string, ProposedQuoteLine>();
	for (const line of proposed) {
		proposedByKey.set(lineKey(line.source, line.catalogItemId, line.appliedRuleId, line.description), line);
	}

	const entries: QuoteLineDiffEntry[] = [];
	for (const line of proposed) {
		const key = lineKey(line.source, line.catalogItemId, line.appliedRuleId, line.description);
		const match = currentByKey.get(key) ?? null;
		entries.push({
			key,
			status: match ? (sameLine(match, line) ? 'unchanged' : 'changed') : 'new',
			isRule: line.source === 'rule_applied',
			current: match,
			proposed: line
		});
	}
	for (const line of current) {
		const key = lineKey(line.source, line.catalogItemId, line.appliedRuleId, line.description);
		if (!proposedByKey.has(key)) {
			entries.push({
				key,
				status: 'removed',
				isRule: line.source === 'rule_applied',
				current: line,
				proposed: null
			});
		}
	}
	return entries;
}

function defaultSelection(entry: QuoteLineDiffEntry): boolean {
	switch (entry.status) {
		case 'changed':
			// Keep the owner's manual edit by default; otherwise adopt the new value.
			return !(entry.current?.wasEditedByUser ?? false);
		case 'new':
			return true;
		case 'removed':
			return entry.current?.wasEditedByUser ?? false;
		default:
			return true;
	}
}

function buildResultLines(
	lineEntries: QuoteLineDiffEntry[],
	ruleEntries: QuoteLineDiffEntry[],
	selection: Record<string, boolean>
): ReplaceQuoteLineInput[] {
	const result: ReplaceQuoteLineInput[] = [];
	for (const entry of lineEntries) {
		const selected = selection[entry.key] ?? false;
		if (entry.status === 'unchanged' && entry.proposed) {
			result.push(proposedLineToReplaceInput(entry.proposed));
		} else if (entry.status === 'changed') {
			if (selected && entry.proposed) {
				result.push(proposedLineToReplaceInput(entry.proposed));
			} else if (!selected && entry.current) {
				result.push(currentLineToReplaceInput(entry.current));
			}
		} else if (entry.status === 'new' && selected && entry.proposed) {
			result.push(proposedLineToReplaceInput(entry.proposed));
		} else if (entry.status === 'removed' && selected && entry.current) {
			result.push(currentLineToReplaceInput(entry.current));
		}
	}
	// Rule-derived lines always refresh to the new proposal; removed ones drop.
	for (const entry of ruleEntries) {
		if (entry.proposed) {
			result.push(proposedLineToReplaceInput(entry.proposed));
		}
	}
	return result;
}

function currentLineToReplaceInput(line: QuoteLineItem): ReplaceQuoteLineInput {
	return {
		description: line.description,
		unit: line.unit,
		quantity: line.quantity,
		unitPriceEur: line.unitPriceEur,
		vatRate: line.vatRate,
		vatReverseCharged: line.vatReverseCharged,
		source: line.source,
		wasEditedByUser: line.wasEditedByUser,
		catalogItemId: line.catalogItemId,
		appliedRuleId: line.appliedRuleId,
		note: line.note
	};
}

function proposedLineToReplaceInput(line: ProposedQuoteLine): ReplaceQuoteLineInput {
	return {
		description: line.description,
		unit: line.unit,
		quantity: String(line.quantity),
		unitPriceEur: line.unitPriceEur,
		vatRate: line.vatRate,
		vatReverseCharged: false,
		source: line.source,
		wasEditedByUser: false,
		catalogItemId: line.catalogItemId,
		appliedRuleId: line.appliedRuleId,
		note: line.note
	};
}

function QuoteDraftEditor({ draft, opportunityId }: { draft: QuoteDraft; opportunityId: string }) {
	const addLine = useAddQuoteLineItem(opportunityId);
	const totals = computeQuoteTotals(draft.lineItems);

	return (
		<Paper variant='outlined' sx={{ p: 2 }}>
			<Table size='small'>
				<TableHead>
					<TableRow>
						<TableCell>Omschrijving</TableCell>
						<TableCell align='right' sx={{ width: 90 }}>
							Aantal
						</TableCell>
						<TableCell align='right' sx={{ width: 120 }}>
							Stuksprijs
						</TableCell>
						<TableCell sx={{ width: 130 }}>BTW</TableCell>
						<TableCell align='right' sx={{ width: 110 }}>
							Regeltotaal
						</TableCell>
						<TableCell sx={{ width: 48 }} />
					</TableRow>
				</TableHead>
				<TableBody>
					{draft.lineItems.map(line => (
						<QuoteLineRow key={line.id} line={line} opportunityId={opportunityId} quoteDraftId={draft.id} />
					))}
				</TableBody>
			</Table>

			<Stack
				direction='row'
				useFlexGap
				spacing={1}
				sx={{ mt: 1, justifyContent: 'space-between', alignItems: 'center' }}
			>
				<Button
					size='small'
					variant='text'
					onClick={() =>
						addLine.mutate({
							quoteDraftId: draft.id,
							input: {
								description: 'Nieuwe regel',
								quantity: '1',
								unitPriceEur: null,
								vatRate: 21,
								vatReverseCharged: false
							}
						})
					}
					disabled={addLine.isPending}
				>
					+ Regel toevoegen
				</Button>
			</Stack>

			{totals.unpricedLineCount > 0 && (
				<Alert severity='warning' sx={{ mt: 2 }}>
					{totals.unpricedLineCount === 1
						? 'Eén regel heeft nog geen prijs en telt niet mee in het totaal.'
						: `${totals.unpricedLineCount} regels hebben nog geen prijs en tellen niet mee in het totaal.`}
				</Alert>
			)}

			<Divider sx={{ my: 2 }} />
			<QuoteTotals totals={totals} />
		</Paper>
	);
}

function QuoteTotals({ totals }: { totals: ReturnType<typeof computeQuoteTotals> }) {
	return (
		<Stack useFlexGap spacing={0.5} sx={{ ml: 'auto', maxWidth: 360 }}>
			<Stack direction='row' useFlexGap spacing={2} sx={{ justifyContent: 'space-between' }}>
				<Typography variant='body2' color='text.secondary'>
					Subtotaal (excl. btw)
				</Typography>
				<Typography variant='body2'>{toReadableEuro(totals.netCents / 100)}</Typography>
			</Stack>

			{totals.brackets.map(bracket => (
				<Stack key={bracket.key} useFlexGap spacing={0}>
					<Stack direction='row' useFlexGap spacing={2} sx={{ justifyContent: 'space-between' }}>
						<Typography variant='body2' color='text.secondary'>
							{bracketVatLabel(bracket)}{' '}
							<Typography component='span' variant='caption' color='text.secondary'>
								over {toReadableEuro(bracket.netCents / 100)}
							</Typography>
						</Typography>
						<Typography variant='body2'>{toReadableEuro(bracket.vatCents / 100)}</Typography>
					</Stack>
					{/* Reverse charge isn't a discount — the net still counts; only the VAT
					    (€0 here) shifts to the customer. Spell that out so €0 doesn't read as a
					    mistake. */}
					{bracket.reverseCharged && (
						<Typography variant='caption' color='text.secondary'>
							verlegd naar afnemer
						</Typography>
					)}
				</Stack>
			))}

			<Divider sx={{ my: 0.5 }} />
			<Stack direction='row' useFlexGap spacing={2} sx={{ justifyContent: 'space-between' }}>
				<Typography variant='subtitle2'>Totaal</Typography>
				<Typography variant='subtitle2'>{toReadableEuro(totals.grossCents / 100)}</Typography>
			</Stack>
		</Stack>
	);
}

function QuoteLineRow({
	line,
	opportunityId,
	quoteDraftId
}: {
	line: QuoteLineItem;
	opportunityId: string;
	quoteDraftId: string;
}) {
	const update = useUpdateQuoteLineItem(opportunityId);
	const remove = useDeleteQuoteLineItem(opportunityId);

	const [description, setDescription] = useState(line.description);
	const [quantity, setQuantity] = useState(line.quantity);
	const [unitPrice, setUnitPrice] = useState(line.unitPriceEur ?? '');

	const vatValue = line.vatReverseCharged ? 'verlegd' : String(line.vatRate);

	const commit = (input: Parameters<typeof update.mutate>[0]['input']) =>
		update.mutate({ quoteDraftId, lineItemId: line.id, input });

	return (
		<TableRow>
			<TableCell>
				<StandaloneField
					name={`desc-${line.id}`}
					value={description}
					fullWidth
					size='small'
					onChange={e => setDescription(e.target.value)}
					onBlur={() => {
						const next = description.trim();
						if (next.length > 0 && next !== line.description) {
							commit({ description: next });
						} else {
							setDescription(line.description);
						}
					}}
				/>
				<Stack
					direction='row'
					useFlexGap
					spacing={0.5}
					sx={{ mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}
				>
					<Chip size='small' variant='outlined' label={SOURCE_LABELS_NL[line.source]} />
					{line.vatReverseCharged && (
						<Chip size='small' variant='outlined' color='info' label='BTW verlegd' />
					)}
					{line.note && (
						<Typography variant='caption' color='text.secondary'>
							{line.note}
						</Typography>
					)}
				</Stack>
			</TableCell>
			<TableCell align='right'>
				<StandaloneField
					name={`qty-${line.id}`}
					value={quantity}
					size='small'
					onChange={e => setQuantity(e.target.value)}
					onBlur={() => {
						if (quantity !== line.quantity && QUANTITY_PATTERN.test(quantity)) {
							commit({ quantity });
						} else {
							setQuantity(line.quantity);
						}
					}}
				/>
			</TableCell>
			<TableCell align='right'>
				<StandaloneField
					name={`price-${line.id}`}
					value={unitPrice}
					size='small'
					placeholder='—'
					onChange={e => setUnitPrice(e.target.value)}
					onBlur={() => {
						const trimmed = unitPrice.trim();
						const next = trimmed === '' ? null : trimmed;
						if (next !== line.unitPriceEur && (next === null || MONEY_PATTERN.test(next))) {
							commit({ unitPriceEur: next });
						} else {
							setUnitPrice(line.unitPriceEur ?? '');
						}
					}}
				/>
			</TableCell>
			<TableCell>
				<StandaloneSelect
					name={`vat-${line.id}`}
					value={vatValue}
					size='small'
					fullWidth
					options={VAT_OPTIONS}
					onChange={event => {
						const value = event.target.value;
						commit(
							value === 'verlegd'
								? { vatReverseCharged: true }
								: { vatReverseCharged: false, vatRate: Number(value) }
						);
					}}
				/>
			</TableCell>
			<TableCell align='right'>
				<Typography variant='body2'>
					{line.unitPriceEur === null ? '—' : toReadableEuro(lineNetCents(line) / 100)}
				</Typography>
			</TableCell>
			<TableCell align='right'>
				<Button
					size='small'
					variant='text'
					color='error'
					disabled={remove.isPending}
					onClick={() => remove.mutate({ quoteDraftId, lineItemId: line.id })}
				>
					×
				</Button>
			</TableCell>
		</TableRow>
	);
}

function bracketVatLabel(bracket: QuoteVatBracketTotal): string {
	return bracket.reverseCharged ? 'BTW verlegd' : `BTW ${bracket.vatRate}%`;
}
