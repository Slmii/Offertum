import { AppIcon } from '@/components/AppIcon.component';
import Button from '@mui/material/Button';
import { Link } from '@tanstack/react-router';

/** Subtle "← Alle offerteaanvragen" link back to the opportunities list (detail header). */
export function BackToListLink() {
	return (
		<Button
			size='small'
			variant='text'
			color='inherit'
			component={Link}
			to='/opportunities'
			startIcon={<AppIcon name='arrow-left' size='small' />}
			sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 'normal' }}
		>
			Alle offerteaanvragen
		</Button>
	);
}
