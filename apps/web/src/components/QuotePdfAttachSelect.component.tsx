import { AppIcon } from '@/components/AppIcon.component';
import { BodySmall } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import { quoteDraftsQueryOptions, useAttachQuotePdf } from '@/lib/queries/quote-drafts.queries';
import { toReadableDateTime } from '@/lib/utils/date.utils';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import InputLabel from '@mui/material/InputLabel';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useTheme } from '@mui/material/styles';
import type { ReplyDraftAttachment } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Custom "Offerte-PDF meesturen" picker — ported from the design's `PdfAttachPicker`. A styled
 * trigger button (file icon + v{n} · filename + generated-at, or "Geen offerte-PDF") opens a
 * menu of the generated quote-PDF versions plus a "Geen offerte-PDF" detach option. At most one
 * PDF rides along with the email; picking another replaces it. When no PDF has been generated
 * yet it falls back to a dashed empty-state pointing at the offerte. Failures surface as a toast.
 */
export function QuotePdfAttachSelect({
	opportunityId,
	attachments,
	readOnly
}: {
	opportunityId: string;
	attachments: ReplyDraftAttachment[];
	readOnly: boolean;
}) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const { data } = useSuspenseQuery(quoteDraftsQueryOptions(opportunityId));
	const attach = useAttachQuotePdf(opportunityId);
	const toast = useToast();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

	// Attached PDF id per the server. Mirror it locally + set optimistically on commit so the
	// trigger reflects the new pick immediately instead of flashing the previous selection during
	// the mutation round-trip. Re-syncs when the prop catches up; reverts on error.
	const serverPdfId = attachments.find(attachment => attachment.quotePdfId)?.quotePdfId ?? null;
	const [selectedPdfId, setSelectedPdfId] = useState<string | null>(serverPdfId);
	const [prevServerPdfId, setPrevServerPdfId] = useState<string | null>(serverPdfId);
	if (serverPdfId !== prevServerPdfId) {
		setPrevServerPdfId(serverPdfId);
		setSelectedPdfId(serverPdfId);
	}

	const commit = (quotePdfId: string | null) => {
		setAnchorEl(null);
		setSelectedPdfId(quotePdfId);
		attach.mutate(quotePdfId, {
			onError: err => {
				setSelectedPdfId(serverPdfId);
				toast.error('Bijwerken mislukt', err instanceof Error ? err.message : 'Probeer het opnieuw.');
			}
		});
	};

	// No generated PDF yet → dashed empty-state nudging toward the offerte (hidden once sent).
	if (data.pdfs.length === 0) {
		if (readOnly) {
			return null;
		}

		return (
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1.5,
					py: 1.5,
					px: 1.75,
					backgroundColor: c.paper2,
					border: `1px dashed ${c.lineStrong}`,
					borderRadius: `${tokens.radius.md}px`
				}}
			>
				<Box component='span' sx={{ display: 'inline-flex', color: c.ink4, flexShrink: 0 }}>
					<AppIcon name='file-plus' size='small' />
				</Box>
				<BodySmall color='textSecondary' sx={{ flex: 1, minWidth: 0 }}>
					Nog geen offerte-PDF. Genereer er een in de offerte om mee te sturen.
				</BodySmall>
			</Box>
		);
	}

	// Newest-first list → highest version number = latest.
	const versionByPdfId = new Map(data.pdfs.map((pdf, index) => [pdf.id, data.pdfs.length - index]));
	const selected = data.pdfs.find(pdf => pdf.id === selectedPdfId) ?? null;
	const isOpen = Boolean(anchorEl);
	const disabled = readOnly || attach.isPending;

	return (
		<Box>
			<InputLabel sx={{ mb: 0.5 }}>Offerte-PDF meesturen</InputLabel>
			<ButtonBase
				disabled={disabled}
				onClick={event => setAnchorEl(event.currentTarget)}
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1.25,
					width: '100%',
					minHeight: 40,
					padding: '6px 10px 6px 12px',
					backgroundColor: disabled && !attach.isPending ? c.paper2 : c.surface,
					border: `1px solid ${isOpen ? c.accent[500] : c.lineStrong}`,
					borderRadius: `${tokens.radius.md}px`,
					boxShadow: isOpen ? tokens.focusRing : 'none',
					color: c.ink2,
					fontFamily: tokens.font.sans,
					fontSize: 14,
					textAlign: 'left',
					cursor: disabled ? 'default' : 'pointer'
				}}
			>
				{attach.isPending ? (
					<>
						<CircularProgress size={14} />
						<Box component='span' sx={{ flex: 1, color: c.ink4 }}>
							Bijlage bijwerken…
						</Box>
					</>
				) : selected ? (
					<>
						<Box component='span' sx={{ display: 'inline-flex', color: c.accent[700], flexShrink: 0 }}>
							<AppIcon name='file-text' size='small' />
						</Box>
						<Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
								<Box
									component='span'
									sx={{
										fontWeight: 'bold',
										color: c.ink1,
										flexShrink: 0,
										fontVariantNumeric: 'tabular-nums'
									}}
								>
									v{versionByPdfId.get(selected.id)}
								</Box>
								<Box
									component='span'
									sx={{
										color: c.ink2,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap'
									}}
								>
									{selected.filename}
								</Box>
							</Box>
							<Box component='span' sx={{ fontSize: 11, color: c.ink4 }}>
								{toReadableDateTime(selected.createdAt)}
							</Box>
						</Box>
					</>
				) : (
					<>
						<Box component='span' sx={{ display: 'inline-flex', color: c.ink4, flexShrink: 0 }}>
							<AppIcon name='file-x' size='small' />
						</Box>
						<Box component='span' sx={{ flex: 1, color: c.ink4 }}>
							Geen offerte-PDF
						</Box>
					</>
				)}
				{!disabled && (
					<Box component='span' sx={{ display: 'inline-flex', color: c.ink3, flexShrink: 0 }}>
						<AppIcon name='chevron-down' size='small' />
					</Box>
				)}
			</ButtonBase>

			<Menu
				anchorEl={anchorEl}
				open={isOpen}
				onClose={() => setAnchorEl(null)}
				slotProps={{ paper: { sx: { minWidth: anchorEl?.offsetWidth ?? 320 } } }}
			>
				<Box
					sx={{
						px: 1.25,
						pt: 0.75,
						pb: 0.5,
						fontSize: 10,
						fontWeight: 'bold',
						letterSpacing: '0.06em',
						textTransform: 'uppercase',
						color: c.ink4
					}}
				>
					PDF-versies
				</Box>
				{data.pdfs.map(pdf => {
					const isSelected = pdf.id === selectedPdfId;
					return (
						<MenuItem key={pdf.id} selected={isSelected} onClick={() => commit(pdf.id)} sx={{ gap: 1.25 }}>
							<Box
								component='span'
								sx={{
									fontSize: 12,
									fontWeight: 'bold',
									color: isSelected ? c.accent[700] : c.ink1,
									backgroundColor: isSelected ? c.surface : c.paper3,
									px: 1,
									py: 0.25,
									borderRadius: `${tokens.radius.sm}px`,
									flexShrink: 0,
									fontVariantNumeric: 'tabular-nums'
								}}
							>
								v{versionByPdfId.get(pdf.id)}
							</Box>
							<Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
								<Box
									component='span'
									sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
								>
									{pdf.filename}
								</Box>
								<Box component='span' sx={{ fontSize: 11, color: c.ink4 }}>
									{toReadableDateTime(pdf.createdAt)}
								</Box>
							</Box>
							{isSelected && (
								<Box
									component='span'
									sx={{ display: 'inline-flex', color: c.accent[500], flexShrink: 0 }}
								>
									<AppIcon name='check' size='small' />
								</Box>
							)}
						</MenuItem>
					);
				})}
				<Divider />
				<MenuItem selected={selectedPdfId === null} onClick={() => commit(null)} sx={{ gap: 1.25 }}>
					<Box component='span' sx={{ display: 'inline-flex', color: c.ink4, flexShrink: 0 }}>
						<AppIcon name='file-x' size='small' />
					</Box>
					<Box component='span' sx={{ flex: 1, color: c.ink3 }}>
						Geen offerte-PDF
					</Box>
					{selectedPdfId === null && (
						<Box component='span' sx={{ display: 'inline-flex', color: c.accent[500], flexShrink: 0 }}>
							<AppIcon name='check' size='small' />
						</Box>
					)}
				</MenuItem>
			</Menu>
		</Box>
	);
}
