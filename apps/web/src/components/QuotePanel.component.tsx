import { Banner } from '@/components/Banner.component';
import { Dialog } from '@/components/Dialog.component';
import { StandaloneField } from '@/components/Form/Field/Field.component';
import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import { BodySmall, H3, Label } from '@/components/Text.component';
import {
	quoteDraftsQueryOptions,
	quotePdfDownloadUrl,
	useAddQuoteLineItem,
	useDeleteQuoteLineItem,
	useGenerateQuoteDraft,
	useGenerateQuotePdf,
	useGenerateQuotePreview,
	useReplaceQuoteLines,
	useUpdateQuoteLineItem
} from '@/lib/queries/quote-drafts.queries';
import { toReadableDate, toReadableDateTime } from '@/lib/utils/date.utils';
import { toReadableEuro } from '@/lib/utils/number.utils';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import {
	computeQuoteTotals,
	lineNetCents,
	type ProposedQuoteLine,
	type QuoteDraft,
	type QuoteLineItem,
	type QuotePdf,
	type QuoteVatBracketTotal,
	type ReplaceQuoteLineInput
} from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

// Leading `-` allowed for discount ("Korting") lines; quantity stays non-negative.
const MONEY_PATTERN = /^-?\d{1,8}(\.\d{1,2})?$/;
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
				<H3>Offerte</H3>
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

			{latest?.validUntil && (
				<BodySmall color='textSecondary' sx={{ mb: 1 }}>
					Geldig tot {toReadableDate(latest.validUntil)}
				</BodySmall>
			)}

			{generate.isError && (
				<Banner tone='error' sx={{ mb: 1 }}>
					Offerte opstellen mislukt:{' '}
					{generate.error instanceof Error ? generate.error.message : 'Onbekende fout'}
				</Banner>
			)}
			{preview.isError && (
				<Banner tone='error' sx={{ mb: 1 }}>
					Nieuw voorstel maken mislukt:{' '}
					{preview.error instanceof Error ? preview.error.message : 'Onbekende fout'}
				</Banner>
			)}
			{pricingStale && (
				<Banner
					tone='info'
					sx={{ mb: 1 }}
					action={
						<Button color='inherit' size='small' onClick={openRegenerate} disabled={preview.isPending}>
							Opnieuw genereren
						</Button>
					}
				>
					Je prijsregels zijn bijgewerkt sinds deze offerte werd opgesteld. Wil je de offerte opnieuw laten
					genereren met de nieuwe prijzen?
				</Banner>
			)}

			{latest ? (
				<QuoteDraftEditor draft={latest} opportunityId={opportunityId} />
			) : (
				<Paper variant='outlined' sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
					<BodySmall color='textSecondary' sx={{ display: 'block', mb: 2 }}>
						Nog geen offerte opgesteld. Stel automatisch regels voor op basis van de aanvraag, je catalogus
						en je prijsregels.
					</BodySmall>
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

			<QuotePdfHistory pdfs={data.pdfs} />

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

/** Version history of generated quote PDFs — each viewable/downloadable. */
function QuotePdfHistory({ pdfs }: { pdfs: QuotePdf[] }) {
	if (pdfs.length === 0) {
		return null;
	}
	return (
		<Box sx={{ mt: 3 }}>
			<Label sx={{ display: 'block', mb: 1 }}>PDF-versies ({pdfs.length})</Label>
			<Paper variant='outlined' sx={{ p: 1.5 }}>
				<Stack useFlexGap spacing={0.5}>
					{pdfs.map((pdf, index) => (
						<Stack
							key={pdf.id}
							direction='row'
							useFlexGap
							spacing={1}
							sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}
						>
							<BodySmall color='textSecondary'>v{pdfs.length - index}</BodySmall>
							<Link href={quotePdfDownloadUrl(pdf.id)} target='_blank' rel='noopener' underline='hover'>
								{pdf.filename}
							</Link>
							<BodySmall color='textSecondary'>{toReadableDateTime(pdf.createdAt)}</BodySmall>
						</Stack>
					))}
				</Stack>
			</Paper>
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
		<Dialog
			open
			title='Offerte opnieuw genereren'
			onClose={onClose}
			width={880}
			action={
				<>
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
				</>
			}
		>
			<BodySmall color='textSecondary' sx={{ display: 'block', mb: 2 }}>
				Vergelijk je huidige offerte met het nieuwe voorstel en kies per regel wat er gebeurt. Toeslagen en
				voorrijkosten worden automatisch opnieuw berekend.
			</BodySmall>

			<Label sx={{ display: 'block', mb: 1 }}>Werk &amp; materialen</Label>
			<Stack useFlexGap spacing={1}>
				{lineEntries.length === 0 && (
					<BodySmall color='textSecondary'>Geen werk- of materiaalregels.</BodySmall>
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
					<Label sx={{ display: 'block', mb: 1 }}>Automatisch herberekend (prijsregels)</Label>
					<Stack useFlexGap spacing={0.5}>
						{ruleEntries.map(entry => (
							<RuleDiffRow key={entry.key} entry={entry} />
						))}
					</Stack>
				</>
			)}

			{replace.isError && (
				<Banner tone='error' sx={{ mt: 2 }}>
					Toepassen mislukt: {replace.error instanceof Error ? replace.error.message : 'Onbekende fout'}
				</Banner>
			)}
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
							<BodySmall>{entry.proposed.description}</BodySmall>
						</Stack>
					}
				/>
				<BodySmall color='textSecondary' sx={{ display: 'block', pl: '30px' }}>
					huidig: {summarize(entry.current.quantity, entry.current.unitPriceEur)} → nieuw:{' '}
					{summarize(String(entry.proposed.quantity), entry.proposed.unitPriceEur)} ·{' '}
					{checked ? 'nieuwe regel gebruiken' : 'huidige regel behouden'}
				</BodySmall>
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
						<BodySmall color='textSecondary'>(behouden?)</BodySmall>
					</Stack>
				}
			/>
		);
	}

	return null;
}

function RuleDiffRow({ entry }: { entry: QuoteLineDiffEntry }) {
	if (!entry.proposed) {
		return <BodySmall color='textSecondary'>{entry.current?.description} — vervalt</BodySmall>;
	}
	const changed = entry.current !== null && !sameLine(entry.current, entry.proposed);
	return (
		<BodySmall>
			{entry.proposed.description} · {summarize(String(entry.proposed.quantity), entry.proposed.unitPriceEur)}
			{changed && entry.current && (
				<BodySmall component='span' color='textSecondary'>
					{' '}
					(was {formatLinePrice(entry.current.unitPriceEur)})
				</BodySmall>
			)}
		</BodySmall>
	);
}

function LineSummary({ line }: { line: QuoteLineItem | ProposedQuoteLine }) {
	return (
		<BodySmall>
			{line.description}{' '}
			<BodySmall component='span' color='textSecondary'>
				· {summarize(String(line.quantity), line.unitPriceEur)}
			</BodySmall>
		</BodySmall>
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
	// One-to-one greedy match so duplicate descriptions don't collapse: each proposed
	// line consumes at most one current line with the same key. Entry keys are unique
	// (current.id, else new-index) so React keys + the selection map never collide.
	const remainingCurrent = [...current];
	const entries: QuoteLineDiffEntry[] = [];
	let newIndex = 0;

	for (const line of proposed) {
		const key = lineKey(line.source, line.catalogItemId, line.appliedRuleId, line.description);
		const matchIndex = remainingCurrent.findIndex(
			candidate =>
				lineKey(candidate.source, candidate.catalogItemId, candidate.appliedRuleId, candidate.description) ===
				key
		);
		const match = matchIndex >= 0 ? remainingCurrent[matchIndex] : null;
		if (match) {
			remainingCurrent.splice(matchIndex, 1);
			entries.push({
				key: `cur:${match.id}`,
				status: sameLine(match, line) ? 'unchanged' : 'changed',
				isRule: line.source === 'rule_applied',
				current: match,
				proposed: line
			});
		} else {
			entries.push({
				key: `new:${newIndex++}`,
				status: 'new',
				isRule: line.source === 'rule_applied',
				current: null,
				proposed: line
			});
		}
	}

	for (const line of remainingCurrent) {
		entries.push({
			key: `cur:${line.id}`,
			status: 'removed',
			isRule: line.source === 'rule_applied',
			current: line,
			proposed: null
		});
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
	const generatePdf = useGenerateQuotePdf(opportunityId);
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
				<Button
					size='small'
					variant='outlined'
					onClick={() => generatePdf.mutate(draft.id)}
					disabled={generatePdf.isPending || totals.unpricedLineCount > 0}
					startIcon={generatePdf.isPending ? <CircularProgress size={14} /> : null}
				>
					{generatePdf.isPending ? 'Bezig…' : 'Genereer PDF'}
				</Button>
			</Stack>

			{totals.unpricedLineCount > 0 && (
				<Banner tone='warning' sx={{ mt: 2 }}>
					{totals.unpricedLineCount === 1
						? 'Eén regel heeft nog geen prijs en telt niet mee in het totaal.'
						: `${totals.unpricedLineCount} regels hebben nog geen prijs en tellen niet mee in het totaal.`}
				</Banner>
			)}
			{generatePdf.isError && (
				<Banner tone='error' sx={{ mt: 2 }}>
					PDF genereren mislukt:{' '}
					{generatePdf.error instanceof Error ? generatePdf.error.message : 'Onbekende fout'}
				</Banner>
			)}
			{generatePdf.isSuccess && !generatePdf.isPending && (
				<Banner tone='success' sx={{ mt: 2 }}>
					PDF-versie aangemaakt. Kies hem onder "Bijlagen" om mee te sturen met het concept-antwoord.
				</Banner>
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
				<BodySmall color='textSecondary'>Subtotaal (excl. btw)</BodySmall>
				<BodySmall>{toReadableEuro(totals.netCents / 100)}</BodySmall>
			</Stack>

			{totals.brackets.map(bracket => (
				<Stack key={bracket.key} useFlexGap spacing={0}>
					<Stack direction='row' useFlexGap spacing={2} sx={{ justifyContent: 'space-between' }}>
						<BodySmall color='textSecondary'>
							{bracketVatLabel(bracket)}{' '}
							<BodySmall component='span' color='textSecondary'>
								over {toReadableEuro(bracket.netCents / 100)}
							</BodySmall>
						</BodySmall>
						<BodySmall>{toReadableEuro(bracket.vatCents / 100)}</BodySmall>
					</Stack>
					{/* Reverse charge isn't a discount — the net still counts; only the VAT
					    (€0 here) shifts to the customer. Spell that out so €0 doesn't read as a
					    mistake. */}
					{bracket.reverseCharged && <BodySmall color='textSecondary'>verlegd naar afnemer</BodySmall>}
				</Stack>
			))}

			<Divider sx={{ my: 0.5 }} />
			<Stack direction='row' useFlexGap spacing={2} sx={{ justifyContent: 'space-between' }}>
				<Label>Totaal</Label>
				<Label>{toReadableEuro(totals.grossCents / 100)}</Label>
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

	// Local buffers committed on blur. A regenerate-apply replaces lines (new ids → this
	// row remounts with fresh values); single-line saves echo back identical values, so
	// no in-place re-sync is needed.
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
					{line.note && <BodySmall color='textSecondary'>{line.note}</BodySmall>}
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
				<BodySmall>{line.unitPriceEur === null ? '—' : toReadableEuro(lineNetCents(line) / 100)}</BodySmall>
			</TableCell>
			<TableCell align='right'>
				<Button
					size='small'
					variant='text'
					color='error'
					aria-label='Regel verwijderen'
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
