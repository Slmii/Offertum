import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { BannerStack, type BannerStackItem, type BannerTone } from '@/components/BannerStack.component';
import { Dialog } from '@/components/Dialog.component';
import { FlowingGradient } from '@/components/FlowingGradient.component';
import { StandaloneField } from '@/components/Form/Field/Field.component';
import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import { type Option } from '@/components/Form/Select/Select.types';
import { BodySmall, H1, H3, Label } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import { catalogItemsQueryOptions } from '@/lib/queries/catalog-items.queries';
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
import { vatSettingsQueryOptions } from '@/lib/queries/vat-settings.queries';
import { toDaysUntil, toReadableDate } from '@/lib/utils/date.utils';
import { toReadableBytes, toReadableEuro } from '@/lib/utils/number.utils';
import { AddCatalogItemsDialog } from '@/routes/(app)/opportunities/-components/Quote/AddCatalogItemsDialog.component';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import {
	buildQuoteVatOptionsWithUsed,
	computeQuoteTotals,
	getDefaultVatRate,
	lineNetCents,
	pluralize,
	quoteVatLineToOptionId,
	quoteVatOptionToLine,
	type ProposedQuoteLine,
	type QuoteDraft,
	type QuoteLineItem,
	type QuotePdf,
	type QuoteVatBracketTotal,
	type ReplaceQuoteLineInput
} from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

// Leading `-` allowed for discount ("Korting") lines; quantity stays non-negative.
const MONEY_PATTERN = /^-?\d{1,8}(\.\d{1,2})?$/;
const QUANTITY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

// Stable empty proposal — the regenerate modal stays mounted (for its close animation), so it
// reads this until a preview lands rather than a fresh `[]` each render.
const EMPTY_PROPOSED: ProposedQuoteLine[] = [];

// Surface the expiry notice only once the quote's validity is within this many days (or past).
const QUOTE_EXPIRY_WARN_DAYS = 14;

// Sentinel option appended to the quote-line VAT dropdown — selecting it doesn't set a rate but
// jumps to the BTW-tarieven settings section so the owner can add a new rate.
const VAT_ADD_OPTION_ID = '__add_vat__';

// Title for the expiry notice, phrased by how many days remain on the quote's validity.
function expiryBannerTitle(days: number, validUntil: string): string {
	if (days < 0) {
		return 'Offerte is verlopen';
	}

	if (days === 0) {
		return 'Offerte verloopt vandaag';
	}

	return `Offerte verloopt over ${days} ${pluralize(days, 'dag', 'dagen')} (${toReadableDate(validUntil)})`;
}

type QuoteSource = QuoteLineItem['source'];

// Per-source chip glyph + the legend's one-line explanation. Colors are tone-derived below.
const SOURCE_META: Record<QuoteSource, { label: string; icon: AppIconName; legend: string }> = {
	catalog_match: { label: 'Catalogus', icon: 'package', legend: 'Uit je catalogus' },
	rule_applied: { label: 'Prijsregel', icon: 'calculator', legend: 'Berekend door een prijsregel' },
	inferred: { label: 'Offertum', icon: 'sparkles', legend: 'Offertum herkende dit — prijs zelf invullen' }
};

const QUOTE_SOURCE_ORDER: QuoteSource[] = ['catalog_match', 'rule_applied', 'inferred'];

/** Provenance chip — neutral for catalog, accent for rule, pending/amber for AI (matches the design). */
function SourceChip({ source }: { source: QuoteSource }) {
	const { tokens } = useTheme();

	const c = tokens.color;
	const tone =
		source === 'rule_applied'
			? { bg: c.accent[50], border: c.accent[300], fg: c.accent[700] }
			: source === 'inferred'
				? { bg: c.pending[50], border: c.pending[500], fg: c.pending[700] }
				: { bg: c.surface, border: c.lineStrong, fg: c.ink2 };

	return (
		<Tooltip title={SOURCE_META[source].legend}>
			<Box
				component='span'
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 0.5,
					px: 0.75,
					borderRadius: `${tokens.radius.sm}px`,
					backgroundColor: tone.bg,
					border: `1px solid ${tone.border}`,
					color: tone.fg,
					fontSize: 12,
					fontWeight: 'bold',
					whiteSpace: 'nowrap'
				}}
			>
				<AppIcon name={SOURCE_META[source].icon} size='small' /> {SOURCE_META[source].label}
			</Box>
		</Tooltip>
	);
}

/** Neutral "Concept" status pill shown next to the quote subtitle (design). */
function ConceptPill() {
	const { tokens } = useTheme();
	const c = tokens.color;
	return (
		<Box
			component='span'
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				px: 0.75,
				borderRadius: `${tokens.radius.sm}px`,
				backgroundColor: c.paper3,
				border: `1px solid ${c.lineStrong}`,
				color: c.ink2,
				fontSize: 12,
				fontWeight: 'bold'
			}}
		>
			Concept
		</Box>
	);
}

/** Compact source legend — "Bron:" + the three chips (labels carry the meaning). */
function SourceLegend() {
	return (
		<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
			<BodySmall color='textSecondary'>Bron:</BodySmall>
			{QUOTE_SOURCE_ORDER.map(source => (
				<SourceChip key={source} source={source} />
			))}
		</Stack>
	);
}

/**
 * Table toolbar — MUI's EnhancedTableToolbar pattern. Empty selection shows the source legend;
 * a non-empty selection tints the bar (accent) and swaps in the selection count + bulk delete.
 */
function QuoteTableToolbar({
	count,
	onClear,
	onDelete,
	deleting
}: {
	count: number;
	onClear: () => void;
	onDelete: () => void;
	deleting: boolean;
}) {
	const hasSelection = count > 0;
	return (
		<Toolbar
			disableGutters
			sx={theme => ({
				minHeight: 0,
				px: 1.5,
				py: 1,
				gap: 1.5,
				borderBottom: `1px solid ${theme.tokens.color.line}`,
				...(hasSelection && { backgroundColor: theme.tokens.color.accent[50] })
			})}
		>
			{hasSelection ? (
				<>
					<BodySmall
						fontWeight='bold'
						sx={theme => ({ flex: '1 1 100%', color: theme.tokens.color.accent[700] })}
					>
						{count} {pluralize(count, 'regel', 'regels')} geselecteerd
					</BodySmall>
					<Button
						size='small'
						variant='text'
						color='inherit'
						onClick={onClear}
						sx={{ minWidth: 'fit-content' }}
					>
						Selectie wissen
					</Button>
					<Tooltip title='Verwijder selectie'>
						<span>
							<IconButton
								color='error'
								aria-label='Verwijder selectie'
								onClick={onDelete}
								disabled={deleting}
							>
								{deleting ? (
									<CircularProgress size={18} color='inherit' />
								) : (
									<AppIcon name='trash' size='small' />
								)}
							</IconButton>
						</span>
					</Tooltip>
				</>
			) : (
				<Box sx={{ flex: '1 1 100%' }}>
					<SourceLegend />
				</Box>
			)}
		</Toolbar>
	);
}

/**
 * W10.3 quote section on the opportunity detail page. Generates a quote draft on
 * demand (W10.1/W10.2), then renders an editable line-item table with live
 * per-BTW-bracket totals. Every number is owner-editable; prices/quantities are
 * decimal strings end-to-end and totals are computed by the shared cents-based
 * `computeQuoteTotals` so the figure here matches the PDF exactly.
 */
export function QuotePanel({
	opportunityId,
	customerName,
	requestType
}: {
	opportunityId: string;
	customerName?: string | null;
	requestType?: string | null;
}) {
	const toast = useToast();
	const { data } = useSuspenseQuery(quoteDraftsQueryOptions(opportunityId));
	const generate = useGenerateQuoteDraft(opportunityId);
	const preview = useGenerateQuotePreview(opportunityId);
	const generatePdf = useGenerateQuotePdf(opportunityId);
	const [regenerateOpen, setRegenerateOpen] = useState(false);
	const [historyOpen, setHistoryOpen] = useState(false);

	const latest = data.drafts[0] ?? null;
	// `updatedAt` bumps when the lines are (re)generated, so this resets after a
	// regenerate-apply. ISO-UTC strings compare lexicographically → SSR-safe (no Date/locale).
	const pricingStale = latest !== null && data.pricingUpdatedAt !== null && data.pricingUpdatedAt > latest.updatedAt;
	// PDF generation lives at this level so its button can sit in the header next to "Opnieuw
	// genereren"; blocked while any line is unpriced or the quote has no lines.
	const unpricedCount = latest ? computeQuoteTotals(latest.lineItems).unpricedLineCount : 0;
	const lineCount = latest ? latest.lineItems.length : 0;
	// An expired quote (validity window past) would produce a PDF whose "Geldig tot" date is already
	// in the past — block PDF generation and nudge a regenerate (which resets the validity window).
	const quoteExpired = latest !== null && latest.validUntil !== null && toDaysUntil(latest.validUntil) < 0;

	const openRegenerate = () =>
		preview.mutate(undefined, {
			onSuccess: () => setRegenerateOpen(true),
			onError: error =>
				toast.error('Nieuw voorstel maken mislukt', error instanceof Error ? error.message : 'Onbekende fout')
		});

	const onGenerate = () =>
		generate.mutate(undefined, {
			onError: error =>
				toast.error('Offerte opstellen mislukt', error instanceof Error ? error.message : 'Onbekende fout')
		});

	const onGeneratePdf = () => {
		if (!latest) {
			return;
		}

		generatePdf.mutate(latest.id, {
			onSuccess: () => {
				toast.success(
					'PDF-versie aangemaakt',
					'Kies hem onder "Bijlagen" om mee te sturen met het concept-antwoord'
				);
			},
			onError: error =>
				toast.error('PDF genereren mislukt', error instanceof Error ? error.message : 'Onbekende fout')
		});
	};

	return (
		<Box>
			<Stack
				direction='row'
				useFlexGap
				spacing={1}
				sx={{ alignItems: 'flex-end', justifyContent: 'space-between', mb: 2 }}
			>
				<Box sx={{ minWidth: 0 }}>
					<H1>Offerte</H1>
					{customerName && (
						<Stack
							direction='row'
							useFlexGap
							spacing={1}
							sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 1 }}
						>
							<BodySmall color='textPrimary'>{customerName}</BodySmall>
							{requestType && (
								<>
									<Box component='span' sx={{ color: 'text.disabled' }}>
										·
									</Box>
									<BodySmall color='textSecondary'>{requestType}</BodySmall>
								</>
							)}
							{latest && (
								<>
									<Box component='span' sx={{ color: 'text.disabled' }}>
										·
									</Box>
									<ConceptPill />
								</>
							)}
						</Stack>
					)}
				</Box>
				{latest && (
					<Stack direction='row' useFlexGap spacing={1} sx={{ flexShrink: 0, alignItems: 'center' }}>
						<Tooltip title='Offertum stelt de offerte opnieuw op aan de hand van de aanvraag en je huidige catalogusprijzen. Regels en bedragen kunnen hierdoor wijzigen.'>
							<Button
								variant='outlined'
								size='large'
								onClick={openRegenerate}
								disabled={preview.isPending}
								startIcon={
									preview.isPending ? (
										<CircularProgress size={14} />
									) : (
										<AppIcon name='refresh' size='small' />
									)
								}
							>
								{preview.isPending ? 'Bezig…' : 'Opnieuw genereren'}
							</Button>
						</Tooltip>
						<Button
							variant='contained'
							size='large'
							onClick={onGeneratePdf}
							disabled={generatePdf.isPending || unpricedCount > 0 || lineCount === 0 || quoteExpired}
							title={
								lineCount === 0
									? 'Voeg eerst een regel toe'
									: unpricedCount > 0
										? 'Vul eerst alle prijzen in'
										: quoteExpired
											? 'Deze offerte is verlopen — genereer hem opnieuw'
											: undefined
							}
							startIcon={
								generatePdf.isPending ? (
									<CircularProgress size={14} color='inherit' />
								) : (
									<AppIcon name='file-text' size='small' />
								)
							}
						>
							{generatePdf.isPending ? 'PDF maken…' : 'Genereer PDF'}
						</Button>
						{data.pdfs.length > 0 && (
							<Button
								variant='outlined'
								size='large'
								onClick={() => setHistoryOpen(true)}
								startIcon={<AppIcon name='clock' size='small' />}
							>
								PDF-versies
								{/* Count badge — same style as the funnel tabs' count chip. */}
								<Box
									component='span'
									className='tabular'
									sx={theme => ({
										ml: 1,
										px: 0.75,
										py: 0.25,
										borderRadius: `${theme.tokens.radius.sm}px`,
										fontSize: 11,
										fontWeight: 'bold',
										backgroundColor: theme.tokens.color.accent[100],
										color: theme.tokens.color.accent[700]
									})}
								>
									{data.pdfs.length}
								</Box>
							</Button>
						)}
					</Stack>
				)}
			</Stack>

			{/* Editor + totals flow below the header; the whole page scrolls (no inner scroll region). */}
			<Box>
				{latest ? (
					<QuoteDraftEditor
						draft={latest}
						opportunityId={opportunityId}
						pricingStale={pricingStale}
						onRegenerate={openRegenerate}
						regenerating={preview.isPending}
					/>
				) : (
					<Paper variant='outlined' sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
						<BodySmall color='textSecondary' sx={{ display: 'block', mb: 2 }}>
							Nog geen offerte opgesteld. Stel automatisch regels voor op basis van de aanvraag, je
							catalogus en je prijsregels.
						</BodySmall>
						<Button
							variant='contained'
							onClick={onGenerate}
							disabled={generate.isPending}
							startIcon={generate.isPending ? <CircularProgress size={14} /> : null}
						>
							{generate.isPending ? 'Bezig…' : 'Genereer offerte'}
						</Button>
					</Paper>
				)}
			</Box>

			{latest && (
				<QuoteRegenerateModal
					opportunityId={opportunityId}
					draft={latest}
					proposed={preview.data?.lines ?? EMPTY_PROPOSED}
					isOpen={regenerateOpen}
					onClose={() => setRegenerateOpen(false)}
				/>
			)}

			{/* Right drawer holding the PDF-versions history, opened from the header button (design). */}
			<Drawer anchor='right' open={historyOpen} onClose={() => setHistoryOpen(false)}>
				<Box sx={{ width: 440, maxWidth: '100vw', height: '100%', display: 'flex', flexDirection: 'column' }}>
					{/* Header — title + count chip + close. */}
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: 2,
							py: 2.5,
							px: 3,
							borderBottom: theme => `1px solid ${theme.tokens.color.line}`
						}}
					>
						<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
							<H3 component='h2'>PDF-versies</H3>
							<Box
								component='span'
								className='tabular'
								sx={theme => ({
									fontSize: 12,
									fontWeight: 'bold',
									color: theme.tokens.color.ink3,
									backgroundColor: theme.tokens.color.paper3,
									px: 0.75,
									py: 0.25,
									borderRadius: `${theme.tokens.radius.sm}px`
								})}
							>
								{data.pdfs.length}
							</Box>
						</Stack>
						<IconButton aria-label='Sluiten' onClick={() => setHistoryOpen(false)}>
							<AppIcon name='x' size='small' />
						</IconButton>
					</Box>

					{/* Sub-header — description + sort note. */}
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: 2,
							py: 1.75,
							px: 3,
							borderBottom: theme => `1px solid ${theme.tokens.color.line}`
						}}
					>
						<BodySmall color='textSecondary'>Elke geproduceerde PDF, met versie en bedrag.</BodySmall>
						<Box
							component='span'
							sx={theme => ({
								display: 'inline-flex',
								alignItems: 'center',
								gap: 0.75,
								flexShrink: 0,
								color: theme.tokens.color.ink4,
								fontSize: 13
							})}
						>
							<AppIcon name='clock' size='small' /> Nieuwste eerst
						</Box>
					</Box>

					{/* Scrollable version list. */}
					<Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
						<QuotePdfHistory pdfs={data.pdfs} />
					</Box>
				</Box>
			</Drawer>
		</Box>
	);
}

/** Version history of generated quote PDFs — the list rendered inside the PDF-versies drawer. */
function QuotePdfHistory({ pdfs }: { pdfs: QuotePdf[] }) {
	if (pdfs.length === 0) {
		return null;
	}
	// Newest first; the highest version number is the newest PDF.
	const sorted = [...pdfs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return (
		<Box>
			{sorted.map((pdf, index) => (
				<QuotePdfRow key={pdf.id} pdf={pdf} version={sorted.length - index} latest={index === 0} />
			))}
		</Box>
	);
}

/** One PDF version row (design's PdfVersionRow): icon tile · v-badge · filename + meta · download. */
function QuotePdfRow({ pdf, version, latest }: { pdf: QuotePdf; version: number; latest: boolean }) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const url = quotePdfDownloadUrl(pdf.id);
	// Prefer the snapshotted amount; older PDFs (no stored total) fall back to file size.
	const meta =
		pdf.totalCents !== null
			? `${toReadableDate(pdf.createdAt)} · ${toReadableEuro((pdf.totalCents ?? 0) / 100)}`
			: `${toReadableDate(pdf.createdAt)} · ${toReadableBytes(pdf.sizeBytes)}`;

	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 1.5,
				py: 1.5,
				px: 2.5,
				borderTop: latest ? 'none' : `1px solid ${c.line}`,
				'&:hover': { backgroundColor: c.paper2 }
			}}
		>
			{/* Document icon tile. */}
			<Box
				component='span'
				sx={{
					width: 40,
					height: 40,
					flexShrink: 0,
					borderRadius: `${tokens.radius.md}px`,
					backgroundColor: c.surface,
					border: `1px solid ${c.lineStrong}`,
					color: c.ink3,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center'
				}}
			>
				<AppIcon name='file-text' size='medium' />
			</Box>

			{/* Version badge. */}
			<Box
				component='span'
				className='tabular'
				sx={{
					flexShrink: 0,
					fontSize: 12,
					fontWeight: 'bold',
					color: c.ink1,
					backgroundColor: c.paper3,
					px: 0.75,
					py: 0.25,
					borderRadius: `${tokens.radius.sm}px`
				}}
			>
				v{version}
			</Box>

			{/* Filename + meta. */}
			<Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
				<Link
					href={url}
					target='_blank'
					rel='noopener'
					underline='hover'
					sx={{ fontWeight: 'medium', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
				>
					{pdf.filename}
				</Link>
				<BodySmall color='textSecondary' className='tabular'>
					{meta}
				</BodySmall>
			</Box>

			{/* "Nieuwste" badge on the newest version. */}
			{latest && (
				<Box
					component='span'
					sx={{
						flexShrink: 0,
						fontSize: 11,
						fontWeight: 'bold',
						color: c.accent[700],
						backgroundColor: c.accent[50],
						border: `1px solid ${c.accent[300]}`,
						px: 1,
						py: 0.25,
						borderRadius: `${tokens.radius.sm}px`
					}}
				>
					Nieuwste
				</Box>
			)}

			<IconButton
				aria-label='PDF downloaden'
				size='small'
				component='a'
				href={url}
				target='_blank'
				rel='noopener'
			>
				<AppIcon name='download' size='small' />
			</IconButton>
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
	isOpen,
	onClose
}: {
	opportunityId: string;
	draft: QuoteDraft;
	proposed: ProposedQuoteLine[];
	isOpen: boolean;
	onClose: () => void;
}) {
	const toast = useToast();
	const replace = useReplaceQuoteLines(opportunityId);
	const entries = useMemo(() => diffQuoteLines(draft.lineItems, proposed), [draft.lineItems, proposed]);

	// Per-entry selection. For `changed`: true = take new, false = keep current.
	// For `new`: true = add. For `removed`: true = keep. `unchanged` is always kept.
	const [selection, setSelection] = useState<Record<string, boolean>>(() =>
		Object.fromEntries(entries.map(entry => [entry.key, defaultSelection(entry)]))
	);

	// The modal stays mounted (so its close animation plays), so re-seed the selection whenever a
	// fresh proposal arrives — adjusting state during render (React's recommended pattern) rather
	// than in an effect. `proposed` is a stable empty array while closed, so this only fires on a
	// real new preview, never on close.
	const [seededFor, setSeededFor] = useState(proposed);
	if (proposed !== seededFor) {
		setSeededFor(proposed);
		setSelection(Object.fromEntries(entries.map(entry => [entry.key, defaultSelection(entry)])));
	}

	const setKey = (key: string, value: boolean) => setSelection(prev => ({ ...prev, [key]: value }));

	const lineEntries = entries.filter(entry => !entry.isRule);
	const ruleEntries = entries.filter(entry => entry.isRule);
	const resultLines = buildResultLines(lineEntries, ruleEntries, selection);

	return (
		<Dialog
			open={isOpen}
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
							replace.mutate(
								{ quoteDraftId: draft.id, lines: resultLines },
								{
									onSuccess: onClose,
									onError: error =>
										toast.error(
											'Toepassen mislukt',
											error instanceof Error ? error.message : 'Onbekende fout'
										)
								}
							)
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
			<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center', pl: 1.5 }}>
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
				<BodySmall color='textSecondary' sx={{ display: 'block', pl: 3.75 }}>
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

// Persisted collapse preference for the quote-notice bar (mirrors the opportunities-list insights bar).
const QUOTE_NOTICES_OPEN_KEY = 'offertum.quoteNotices.open';

function readQuoteNoticesOpen(): boolean {
	try {
		return localStorage.getItem(QUOTE_NOTICES_OPEN_KEY) === '1';
	} catch {
		return false;
	}
}

function writeQuoteNoticesOpen(open: boolean): void {
	try {
		localStorage.setItem(QUOTE_NOTICES_OPEN_KEY, open ? '1' : '0');
	} catch {
		// localStorage unavailable (private mode / SSR) — the preference just won't persist.
	}
}

const NOTICE_SEVERITY_ICON: Record<BannerTone, AppIconName> = {
	info: 'info',
	success: 'circle-check',
	warning: 'alert-triangle',
	error: 'alert-circle'
};

/**
 * Collapsible wrapper around the quote's notice `BannerStack` — used when there are 2+ notices (a
 * single one renders inline), mirroring the opportunities list's `OppInsights` bar so a stack tucks
 * away above the table instead of pushing it down. The summary row (count + flowing accent gradient)
 * stays visible; expanding reveals the full framed stack. Collapsed by default, preference persisted.
 */
function CollapsibleQuoteNotices({ notices }: { notices: BannerStackItem[] }) {
	const { tokens } = useTheme();
	const c = tokens.color;

	// Collapsed by default; the persisted preference is restored after mount so SSR + the first
	// client render agree (no hydration mismatch).
	const [open, setOpen] = useState(false);
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setOpen(readQuoteNoticesOpen());
	}, []);

	if (notices.length === 0) {
		return null;
	}

	const toggle = () => {
		const next = !open;
		setOpen(next);
		writeQuoteNoticesOpen(next);
	};

	// Highest severity present only picks the leading icon; the summary always rides the flowing
	// accent gradient (white text) — the same eye-catcher the opps-list insights bar uses.
	const severity: BannerTone = notices.some(notice => notice.tone === 'error')
		? 'error'
		: notices.some(notice => notice.tone === 'warning')
			? 'warning'
			: 'info';

	// Red flow + border when something's wrong (an expired quote / stale pricing surfaces an error
	// notice); the calm accent flow otherwise.
	const hasError = severity === 'error';
	const frameBorder = hasError ? c.lost[500] : c.accent[300];

	return (
		<Box sx={{ border: `1px solid ${frameBorder}`, borderRadius: `${tokens.radius.md}px`, overflow: 'hidden' }}>
			<FlowingGradient colors={hasError ? [c.lost[700], c.lost[500], c.lost[700]] : undefined}>
				{/* Summary row — always visible, click to toggle. */}
				<ButtonBase
					onClick={toggle}
					aria-expanded={open}
					sx={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'flex-start',
						gap: 1.5,
						width: '100%',
						py: 1.25,
						px: 1.75,
						textAlign: 'left',
						backgroundColor: 'transparent'
					}}
				>
					<Box
						component='span'
						sx={{
							width: 28,
							height: 28,
							borderRadius: `${tokens.radius.sm}px`,
							flexShrink: 0,
							backgroundColor: 'rgba(255, 255, 255, 0.16)',
							border: '1px solid rgba(255, 255, 255, 0.30)',
							color: '#fff',
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center'
						}}
					>
						<AppIcon name={NOTICE_SEVERITY_ICON[severity]} size='small' />
					</Box>
					<Box sx={{ flex: 1, minWidth: 0 }}>
						<BodySmall component='span' fontWeight='bold' sx={{ color: '#fff' }}>
							{notices.length} {pluralize(notices.length, 'melding', 'meldingen')}
						</BodySmall>
					</Box>
					<Box
						component='span'
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 0.5,
							flexShrink: 0,
							color: '#fff',
							fontSize: 13,
							fontWeight: 'bold'
						}}
					>
						{open ? 'Verberg' : 'Toon'}
						<AppIcon name={open ? 'chevron-up' : 'chevron-down'} size='small' />
					</Box>
				</ButtonBase>
			</FlowingGradient>

			{/* Expanded detail — the full framed BannerStack, MUI-animated open/closed. */}
			<Collapse in={open} timeout='auto' unmountOnExit>
				<Box sx={{ p: 1.5, borderTop: `1px solid ${frameBorder}`, backgroundColor: c.surface }}>
					<BannerStack banners={notices} />
				</Box>
			</Collapse>
		</Box>
	);
}

function QuoteDraftEditor({
	draft,
	opportunityId,
	pricingStale,
	onRegenerate,
	regenerating
}: {
	draft: QuoteDraft;
	opportunityId: string;
	pricingStale: boolean;
	onRegenerate: () => void;
	regenerating: boolean;
}) {
	const toast = useToast();
	const addLine = useAddQuoteLineItem(opportunityId);
	const replaceLines = useReplaceQuoteLines(opportunityId);
	const { data: catalog } = useSuspenseQuery(catalogItemsQueryOptions);
	const { data: vatConfig } = useSuspenseQuery(vatSettingsQueryOptions);
	const navigate = useNavigate();
	// A rate can be removed / deactivated in the org's VAT settings after a line was saved at it
	// (nothing prevents this). Union the line's own rate back in so the row's BTW select always has
	// a matching option instead of falling through to the untranslated MUI placeholder.
	const usedRates = draft.lineItems.filter(line => !line.vatReverseCharged).map(line => line.vatRate);
	const vatOptions = buildQuoteVatOptionsWithUsed(vatConfig, usedRates) as Option[];

	// Rows get an extra "add a rate" action that jumps to the BTW-tarieven settings section.
	const vatRowOptions: Option[] = [
		...vatOptions.map((option, index) => ({ ...option, divider: index === vatOptions.length - 1 })),
		{ id: VAT_ADD_OPTION_ID, icon: 'plus', label: 'Nieuw BTW-tarief' }
	];
	const goToVatSettings = () => navigate({ to: '/settings/organization', hash: 'btw-tarieven' });
	const totals = computeQuoteTotals(draft.lineItems);
	const unpriced = totals.unpricedLineCount;

	// "Toevoegen" opens the add-catalog modal in place (no redirect).
	const [addCatalogOpen, setAddCatalogOpen] = useState(false);

	// One consolidated notice stack above the table (design's BannerStack), built from the
	// draft's own data: missing prices, soon-to-expire validity, reverse-charged VAT to verify,
	// and AI lines that aren't in the catalog yet. Mixed tones render as tinted rows in one frame.
	const reverseChargedCount = draft.lineItems.filter(line => line.vatReverseCharged).length;
	// "Niet in je catalogus" = AI-inferred lines whose name isn't (yet) a catalog item. Derived
	// against the LIVE catalog (not just the snapshot `source`), so adding the line to the catalog —
	// which invalidates this query — makes the count drop on the next render.
	const catalogNames = new Set(catalog.items.map(item => item.name.trim().toLowerCase()));
	const notInCatalog = draft.lineItems.filter(
		line => line.source === 'inferred' && !catalogNames.has(line.description.trim().toLowerCase())
	);
	const notInCatalogCount = notInCatalog.length;
	const expiryDays = draft.validUntil === null ? null : toDaysUntil(draft.validUntil);

	const notices: BannerStackItem[] = [];

	// Pricing rules changed after this draft was generated — offer a non-destructive regenerate.
	if (pricingStale) {
		notices.push({
			key: 'pricing-stale',
			tone: 'error',
			title: 'Prijsregels bijgewerkt',
			body: 'Sinds deze offerte werd opgesteld. Genereer opnieuw om de nieuwe prijzen over te nemen.',
			action: (
				<Button color='inherit' size='small' onClick={onRegenerate} disabled={regenerating}>
					Opnieuw genereren
				</Button>
			)
		});
	}

	if (unpriced > 0) {
		notices.push({
			key: 'unpriced',
			tone: 'warning',
			title: `${unpriced} ${pluralize(unpriced, 'regel heeft', 'regels hebben')} nog geen prijs`,
			body: 'Offertum heeft dit werk herkend, maar kan er geen prijs aan koppelen. Vul de prijs in voordat je de offerte verstuurt.'
		});
	}

	// Surface the validity notice only while the quote is close to expiring (or already past) — a
	// fresh 30-day quote stays quiet. An expired quote is a different message: too late to "send on
	// time", so prompt a regenerate (fresh prices + a new validity window) instead.
	if (expiryDays !== null && expiryDays <= QUOTE_EXPIRY_WARN_DAYS) {
		const expired = expiryDays < 0;
		notices.push({
			key: 'expiry',
			tone: expired ? 'error' : 'warning',
			title: expiryBannerTitle(expiryDays, draft.validUntil!),
			body: expired
				? 'De geldigheid van deze offerte is verstreken. Genereer een nieuwe offerte met actuele prijzen en een nieuwe geldigheidsdatum.'
				: 'Stuur de offerte op tijd voordat de geldigheid verloopt.',
			action: expired ? (
				<Button color='inherit' size='small' onClick={onRegenerate} disabled={regenerating}>
					Opnieuw genereren
				</Button>
			) : undefined
		});
	}

	if (reverseChargedCount > 0) {
		notices.push({
			key: 'vat-reverse',
			tone: 'info',
			title: `${vatConfig.reverseChargeLabel} op ${reverseChargedCount} ${pluralize(reverseChargedCount, 'regel', 'regels')}`,
			body: 'Controleer of de verleggingsregeling hier van toepassing is.'
		});
	}

	if (notInCatalogCount > 0) {
		notices.push({
			key: 'catalog',
			tone: 'info',
			title: `${notInCatalogCount} ${pluralize(notInCatalogCount, 'regel', 'regels')} niet in je catalogus`,
			body: 'Voeg ze toe zodat ze de volgende keer automatisch worden geprijsd.',
			action: (
				<Button
					size='small'
					variant='text'
					color='inherit'
					startIcon={<AppIcon name='plus' size='small' />}
					onClick={() => setAddCatalogOpen(true)}
				>
					Toevoegen
				</Button>
			)
		});
	}

	// Row selection for the bulk-delete toolbar. Kept as a Set of line ids; intersected with the
	// current lines on every read so a regenerate/delete that drops ids can't leave stale selection.
	const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
	const selectedCount = draft.lineItems.filter(line => selectedIds.has(line.id)).length;
	const allSelected = draft.lineItems.length > 0 && selectedCount === draft.lineItems.length;
	const someSelected = selectedCount > 0 && !allSelected;

	const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(draft.lineItems.map(line => line.id)));

	const toggleOne = (lineId: string) =>
		setSelectedIds(prev => {
			const next = new Set(prev);
			if (next.has(lineId)) {
				next.delete(lineId);
			} else {
				next.add(lineId);
			}
			return next;
		});

	const clearSelection = () => setSelectedIds(new Set());

	const deleteSelected = () =>
		replaceLines.mutate(
			{
				quoteDraftId: draft.id,
				lines: draft.lineItems.filter(line => !selectedIds.has(line.id)).map(currentLineToReplaceInput)
			},
			{
				onSuccess: clearSelection,
				onError: error =>
					toast.error('Verwijderen mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.')
			}
		);

	return (
		<Stack useFlexGap spacing={3}>
			{/* Notices collapse into the gradient bar above the table (mirrors the opps-list insights
			    bar) so they don't push the table down — used for any count. */}
			<CollapsibleQuoteNotices notices={notices} />

			<Paper variant='outlined' sx={{ overflow: 'hidden' }}>
				{/* EnhancedTableToolbar — legend when idle, selection actions when rows are checked. */}
				<QuoteTableToolbar
					count={selectedCount}
					onClear={clearSelection}
					onDelete={deleteSelected}
					deleting={replaceLines.isPending}
				/>
				{/* The table renders in full and scrolls with the page (no inner scroll region) —
				    add-line + totals flow below it as the last rows of the card. Horizontal scroll
				    stays for narrow viewports. */}
				<TableContainer sx={{ overflowX: 'auto' }}>
					<Table>
						<TableHead sx={{ '& .MuiTableCell-root': { py: 0.5 } }}>
							<TableRow>
								<TableCell padding='checkbox'>
									<Checkbox
										checked={allSelected}
										indeterminate={someSelected}
										onChange={toggleAll}
										slotProps={{ input: { 'aria-label': 'Alle regels selecteren' } }}
									/>
								</TableCell>
								<TableCell>Omschrijving</TableCell>
								<TableCell sx={{ width: 130 }}>Bron</TableCell>
								<TableCell align='right' sx={{ width: 96 }}>
									Aantal
								</TableCell>
								<TableCell align='right' sx={{ width: 150 }}>
									Stuksprijs
								</TableCell>
								<TableCell sx={{ width: 120 }}>BTW</TableCell>
								<TableCell align='right' sx={{ width: 120 }}>
									Regeltotaal
								</TableCell>
								<TableCell sx={{ width: 48 }} />
							</TableRow>
						</TableHead>
						<TableBody>
							{draft.lineItems.map(line => (
								<QuoteLineRow
									key={line.id}
									line={line}
									opportunityId={opportunityId}
									quoteDraftId={draft.id}
									vatOptions={vatRowOptions}
									selected={selectedIds.has(line.id)}
									onToggleSelect={() => toggleOne(line.id)}
									onAddVatRate={goToVatSettings}
								/>
							))}
						</TableBody>
					</Table>
				</TableContainer>

				{/* Add-line + totals flow as the last rows of the card, below the table. */}
				<Box sx={{ px: 1, py: 0.5, borderTop: theme => `1px solid ${theme.tokens.color.line}` }}>
					<Button
						size='small'
						variant='text'
						startIcon={<AppIcon name='plus' size='small' />}
						onClick={() =>
							addLine.mutate(
								{
									quoteDraftId: draft.id,
									input: {
										description: 'Nieuwe regel',
										quantity: '1',
										unitPriceEur: null,
										vatRate: getDefaultVatRate(vatConfig),
										vatReverseCharged: false
									}
								},
								{
									onError: error =>
										toast.error(
											'Regel toevoegen mislukt',
											error instanceof Error ? error.message : 'Probeer het opnieuw.'
										)
								}
							)
						}
						disabled={addLine.isPending}
					>
						Regel toevoegen
					</Button>
				</Box>

				<QuoteTotals totals={totals} reverseChargeLabel={vatConfig.reverseChargeLabel} />
			</Paper>

			<AddCatalogItemsDialog
				isOpen={addCatalogOpen}
				lines={notInCatalog}
				onClose={() => setAddCatalogOpen(false)}
			/>
		</Stack>
	);
}

// One label/value row in the totals footer
function QuoteTotalsLine({ label, value }: { label: string; value: string }) {
	const { tokens } = useTheme();
	const c = tokens.color;
	return (
		<Stack direction='row' useFlexGap spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
			<Box component='span' sx={{ fontSize: 13, color: c.ink3 }}>
				{label}
			</Box>
			<Box
				component='span'
				className='tabular'
				sx={{ fontSize: 14, fontWeight: 'medium', color: c.ink1, whiteSpace: 'nowrap' }}
			>
				{value}
			</Box>
		</Stack>
	);
}

function QuoteTotals({
	totals,
	reverseChargeLabel
}: {
	totals: ReturnType<typeof computeQuoteTotals>;
	reverseChargeLabel: string;
}) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const unpriced = totals.unpricedLineCount;

	return (
		// Docked footer band (design's QuoteTotalsFooter): top rule, paper-2 surface, right-aligned column.
		<Box
			sx={{
				borderTop: `1px solid ${c.lineStrong}`,
				backgroundColor: c.paper2,
				p: 3,
				display: 'flex',
				justifyContent: 'flex-end'
			}}
		>
			<Stack useFlexGap spacing={0.5} sx={{ width: 400, maxWidth: '100%' }}>
				<QuoteTotalsLine label='Subtotaal (excl. btw)' value={toReadableEuro(totals.netCents / 100)} />

				{totals.brackets.map(bracket => (
					<QuoteTotalsLine
						key={bracket.key}
						label={`${bracketVatLabel(bracket, reverseChargeLabel)} (over ${toReadableEuro(bracket.netCents / 100)})`}
						value={toReadableEuro(bracket.vatCents / 100)}
					/>
				))}

				<Stack
					useFlexGap
					sx={{
						mt: 0.5,
						py: 1,
						px: 1.5,
						backgroundColor: c.accent[50],
						border: `1px solid ${c.accent[300]}`,
						borderRadius: `${tokens.radius.md}px`
					}}
				>
					{/* Grand total — emphasized accent bar. */}
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: 2
						}}
					>
						<Box component='span' sx={{ fontSize: 14, fontWeight: 'bold', color: c.accent[700] }}>
							Totaal
						</Box>
						<Box component='span' sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
							<Box
								component='span'
								sx={{ fontSize: 11, fontWeight: 'medium', color: c.accent[700], opacity: 0.7 }}
							>
								incl. btw
							</Box>
							<Box
								component='span'
								className='tabular'
								sx={{
									fontFamily: tokens.font.display,
									fontSize: 24,
									fontWeight: 'bold',
									color: c.accent[700],
									whiteSpace: 'nowrap'
								}}
							>
								{toReadableEuro(totals.grossCents / 100)}
							</Box>
						</Box>
					</Box>
					{unpriced > 0 && (
						<Box
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'flex-end',
								gap: 0.75,
								color: c.pending[700],
								fontSize: 12
							}}
						>
							<AppIcon name='alert-triangle' size='small' /> Voorlopig — {unpriced} ongeprijsde{' '}
							{pluralize(unpriced, 'regel telt', 'regels tellen')} nog niet mee.
						</Box>
					)}
				</Stack>
			</Stack>
		</Box>
	);
}

function QuoteLineRow({
	line,
	opportunityId,
	quoteDraftId,
	vatOptions,
	selected,
	onToggleSelect,
	onAddVatRate
}: {
	line: QuoteLineItem;
	opportunityId: string;
	quoteDraftId: string;
	vatOptions: Option[];
	selected: boolean;
	onToggleSelect: () => void;
	onAddVatRate: () => void;
}) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const toast = useToast();
	const update = useUpdateQuoteLineItem(opportunityId);
	const remove = useDeleteQuoteLineItem(opportunityId);

	// Local buffers committed on blur. A regenerate-apply replaces lines (new ids → this
	// row remounts with fresh values); single-line saves echo back identical values, so
	// no in-place re-sync is needed.
	const [description, setDescription] = useState(line.description);
	const [quantity, setQuantity] = useState(line.quantity);
	const [unitPrice, setUnitPrice] = useState(line.unitPriceEur ?? '');
	// Unpriced AI lines show a "Stel een prijs in" button; clicking it reveals the price field.
	const [editingPrice, setEditingPrice] = useState(false);

	const unpriced = line.unitPriceEur === null;
	const vatValue = quoteVatLineToOptionId(line);

	const commit = (input: Parameters<typeof update.mutate>[0]['input']) =>
		update.mutate(
			{ quoteDraftId, lineItemId: line.id, input },
			{
				onError: error =>
					toast.error('Opslaan mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.')
			}
		);

	return (
		<TableRow
			selected={selected}
			// When selected, let the theme's Mui-selected rules paint the row (accent-50 + left bar);
			// otherwise tint unpriced AI rows amber so the missing price stays visible.
			sx={
				selected
					? undefined
					: {
							backgroundColor: unpriced ? c.pending[50] : 'transparent',
							'&:hover': { backgroundColor: unpriced ? c.pending[50] : c.paper2 }
						}
			}
		>
			<TableCell padding='checkbox'>
				<Checkbox
					checked={selected}
					onChange={onToggleSelect}
					slotProps={{ input: { 'aria-label': 'Regel selecteren' } }}
				/>
			</TableCell>
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
					helperText={line.note ?? undefined}
				/>
			</TableCell>
			<TableCell>
				<SourceChip source={line.source} />
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
				{unpriced && !editingPrice ? (
					<ButtonBase
						onClick={() => setEditingPrice(true)}
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 0.5,
							px: 0.75,
							pr: 1,
							py: 0.5,
							border: 'none',
							borderRadius: `${tokens.radius.sm}px`,
							backgroundColor: c.pending[500],
							color: '#fff',
							fontFamily: tokens.font.sans,
							fontSize: 12,
							fontWeight: 'bold',
							cursor: 'pointer',
							whiteSpace: 'nowrap'
						}}
					>
						<AppIcon name='plus' size='small' /> Stel een prijs in
					</ButtonBase>
				) : (
					<StandaloneField
						name={`price-${line.id}`}
						value={unitPrice}
						size='small'
						placeholder='0.00'
						autoFocus={editingPrice}
						onChange={e => setUnitPrice(e.target.value)}
						onBlur={() => {
							const trimmed = unitPrice.trim();
							const next = trimmed === '' ? null : trimmed;

							if (next !== line.unitPriceEur && (next === null || MONEY_PATTERN.test(next))) {
								commit({ unitPriceEur: next });
							} else {
								setUnitPrice(line.unitPriceEur ?? '');
							}

							setEditingPrice(false);
						}}
					/>
				)}
			</TableCell>
			<TableCell>
				<StandaloneSelect
					name={`vat-${line.id}`}
					value={vatValue}
					size='small'
					fullWidth
					options={vatOptions}
					onChange={event => {
						if (event.target.value === VAT_ADD_OPTION_ID) {
							onAddVatRate();
							return;
						}
						commit(quoteVatOptionToLine(event.target.value));
					}}
				/>
			</TableCell>
			<TableCell align='right'>
				<BodySmall fontWeight={unpriced ? 'normal' : 'bold'}>
					{unpriced ? '—' : toReadableEuro(lineNetCents(line) / 100)}
				</BodySmall>
			</TableCell>
			<TableCell align='right'>
				<IconButton
					aria-label='Regel verwijderen'
					disabled={remove.isPending}
					onClick={() =>
						remove.mutate(
							{ quoteDraftId, lineItemId: line.id },
							{
								onError: error =>
									toast.error(
										'Verwijderen mislukt',
										error instanceof Error ? error.message : 'Probeer het opnieuw.'
									)
							}
						)
					}
					sx={{
						display: 'inline-flex',
						p: 0.5,
						border: 'none',
						background: 'transparent',
						borderRadius: `${tokens.radius.sm}px`,
						color: c.ink4,
						cursor: remove.isPending ? 'default' : 'pointer',
						'&:hover': { backgroundColor: c.paper2, color: c.lost[500] }
					}}
				>
					<AppIcon name='trash' size='small' />
				</IconButton>
			</TableCell>
		</TableRow>
	);
}

function bracketVatLabel(bracket: QuoteVatBracketTotal, reverseChargeLabel: string): string {
	return bracket.reverseCharged ? reverseChargeLabel : `BTW ${bracket.vatRate}%`;
}
