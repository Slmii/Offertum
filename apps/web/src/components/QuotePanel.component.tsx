import { StandaloneField } from '@/components/Form/Field/Field.component';
import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import {
	quoteDraftsQueryOptions,
	useAddQuoteLineItem,
	useDeleteQuoteLineItem,
	useGenerateQuoteDraft,
	useUpdateQuoteLineItem
} from '@/lib/queries/quote-drafts.queries';
import { toReadableEuro } from '@/lib/utils/number.utils';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
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
	type QuoteDraft,
	type QuoteLineItem,
	type QuoteVatBracketTotal
} from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';

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

	const latest = data.drafts[0] ?? null;

	return (
		<Box sx={{ mt: 4 }}>
			<Typography variant='h2' sx={{ fontSize: 18, mb: 1 }}>
				Offerte
			</Typography>
			{generate.isError && (
				<Alert severity='error' sx={{ mb: 1 }}>
					Offerte opstellen mislukt:{' '}
					{generate.error instanceof Error ? generate.error.message : 'Onbekende fout'}
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
		</Box>
	);
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
