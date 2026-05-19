import Button from '@mui/material/Button';
import { useNavigate } from '@tanstack/react-router';

/**
 * Small "← Home" button shown in the header of every authenticated page that isn't the
 * home dashboard itself. Centralized per `[[dry-extract-aggressively]]` so a future copy
 * change ("← Home" → "← Dashboard", or an icon swap) lands in one place.
 */
export function BackToHomeButton() {
	const navigate = useNavigate();
	return (
		<Button size='small' variant='text' onClick={() => navigate({ to: '/' })}>
			← Home
		</Button>
	);
}
