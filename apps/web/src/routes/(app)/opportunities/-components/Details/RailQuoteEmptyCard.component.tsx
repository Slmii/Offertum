import { AppIcon } from '@/components/AppIcon.component';
import { BodySmall, H3 } from '@/components/Text.component';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '@mui/material/styles';

/**
 * Right-rail empty state — shown instead of `RailQuoteCard` when the opportunity has no
 * quote draft yet. Dashed-border card with a "Genereer offerte" action that reuses the
 * same `useGenerateQuoteDraft` mutation as the composer's quote button.
 */
export function RailQuoteEmptyCard({ isGenerating, onGenerate }: { isGenerating: boolean; onGenerate: () => void }) {
	const { tokens } = useTheme();
	const c = tokens.color;

	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'flex-start',
				gap: 1,
				width: '100%',
				p: 2,
				backgroundColor: c.paper2,
				border: `1px dashed ${c.lineStrong}`,
				borderRadius: `${tokens.radius.md}px`
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
				<Box component='span' sx={{ display: 'inline-flex', color: c.ink3 }}>
					<AppIcon name='file-text' size='medium' />
				</Box>
				<H3 component='h3' sx={{ fontSize: 15 }}>
					Offerte
				</H3>
			</Box>
			<BodySmall color='textSecondary'>Nog geen offerte voor deze aanvraag.</BodySmall>
			<Button
				variant='contained'
				size='small'
				onClick={onGenerate}
				disabled={isGenerating}
				startIcon={isGenerating ? <CircularProgress size={14} /> : <AppIcon name='file-plus' size='small' />}
			>
				{isGenerating ? 'Bezig…' : 'Genereer offerte'}
			</Button>
		</Box>
	);
}
