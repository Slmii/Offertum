import { AppIcon } from '@/components/AppIcon.component';
import { Banner } from '@/components/Banner.component';
import { billingNoticeStore, useBillingNotice } from '@/lib/billing-notice.store';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import { Link, useLocation } from '@tanstack/react-router';
import { useEffect } from 'react';

/**
 * Sticky banner that surfaces a `billing_required` (402) error from any
 * mutation or query without yanking the user off the page they were on.
 *
 * Replaces the previous `client.ts` auto-redirect behaviour — the redirect
 * felt like a bug when triggered mid-form, mid-edit, or from a settings page
 * where the user expected to land on a save confirmation, not a billing
 * checkout.
 *
 * Lives in the (app) layout so every authenticated route sees it. Auto-
 * dismisses when the user navigates to `/billing` (the obvious "they're
 * dealing with it" signal — no need to keep nagging).
 */
export function BillingRequiredBanner() {
	const notice = useBillingNotice();
	// Subscribe to just the pathname via the selector — a reactive primitive that
	// drives the effect below, rather than reading the whole (mutable-looking)
	// location object.
	const pathname = useLocation({ select: location => location.pathname });

	// Self-dismiss the banner once the user lands on the billing flow. The
	// banner has already done its job; keeping it visible there is noise.
	useEffect(() => {
		if (pathname.startsWith('/billing')) {
			billingNoticeStore.clear();
		}
	}, [pathname]);

	if (!notice) {
		return null;
	}

	return (
		<Box
			sx={{
				position: 'sticky',
				top: 0,
				zIndex: theme => theme.zIndex.appBar + 1,
				px: { xs: 1, sm: 2 },
				pt: 1
			}}
		>
			<Banner
				tone='warning'
				action={
					<>
						<Button
							component={Link}
							to={notice.billingPath as '/billing'}
							color='inherit'
							size='small'
							sx={{ fontWeight: 'bold', mr: 1 }}
						>
							Naar facturering
						</Button>
						<IconButton
							size='small'
							aria-label='Sluiten'
							onClick={() => billingNoticeStore.clear()}
							sx={{ color: 'inherit', mt: -0.5, mr: -0.5 }}
						>
							<AppIcon name='x' size='medium' />
						</IconButton>
					</>
				}
				sx={{ alignItems: 'center' }}
			>
				{notice.message}
			</Banner>
		</Box>
	);
}
