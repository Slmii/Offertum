import { Banner } from '@/components/Banner.component';
import { BodySmall } from '@/components/Text.component';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';

interface SectionErrorProps {
	error: Error;
	reset?: () => void;
}

// Per-route fallback for TanStack Router's `errorComponent`. Replaces only the
// affected route's portion of the tree — the (app)/route.tsx layout (notification
// bell, header) keeps rendering, so the user can navigate away from the broken
// section instead of staring at an empty page. `reset` (provided by the router)
// re-runs the route's loader.
export function SectionError({ error, reset }: SectionErrorProps) {
	return (
		<Stack>
			<Banner tone='error' sx={{ mb: 3 }}>
				<BodySmall fontWeight='medium' sx={{ mb: 0.5 }}>
					Kon dit onderdeel niet laden.
				</BodySmall>
				<BodySmall color='text.secondary'>
					{error.message || 'Onbekende fout. Probeer het later opnieuw.'}
				</BodySmall>
			</Banner>
			{reset && (
				<Box sx={{ display: 'flex', justifyContent: 'center' }}>
					<Button variant='outlined' onClick={reset}>
						Opnieuw proberen
					</Button>
				</Box>
			)}
		</Stack>
	);
}
