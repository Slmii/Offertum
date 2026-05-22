import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

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
		<Container maxWidth='sm' sx={{ py: 8 }}>
			<Alert severity='error' sx={{ mb: 3 }}>
				<Typography variant='body2' sx={{ fontWeight: 500, mb: 0.5 }}>
					Kon dit onderdeel niet laden.
				</Typography>
				<Typography variant='body2' color='text.secondary'>
					{error.message || 'Onbekende fout. Probeer het later opnieuw.'}
				</Typography>
			</Alert>
			{reset && (
				<Box sx={{ display: 'flex', justifyContent: 'center' }}>
					<Button variant='outlined' onClick={reset}>
						Opnieuw proberen
					</Button>
				</Box>
			)}
		</Container>
	);
}
