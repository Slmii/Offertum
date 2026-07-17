import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SectionError } from '@/components/SectionError.component';
import { BodySmall, H3 } from '@/components/Text.component';
import { UpsellTeaser } from '@/components/UpsellTeaser.component';
import { createPageMeta } from '@/lib/createPageMeta';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import { patternsQueryOptions } from '@/lib/queries/patterns.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/(app)/')({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(myMembershipQueryOptions),
			context.queryClient.ensureQueryData(patternsQueryOptions),
			context.queryClient.ensureQueryData(billingStatusQueryOptions)
		]),
	head: () => ({
		meta: createPageMeta({
			title: 'Offertum',
			description: 'Quote management for SMBs',
			path: '/'
		})
	}),
	component: HomePage,
	errorComponent: SectionError
});

interface QuickLink {
	to: '/opportunities' | '/calendar' | '/team' | '/billing';
	label: string;
	description: string;
	icon: AppIconName;
}

function HomePage() {
	const { tokens } = useTheme();
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);
	const { data: billing } = useSuspenseQuery(billingStatusQueryOptions);

	const isExternal = me.role === 'EXTERNAL';
	const isOwner = me.role === 'OWNER';
	const firstName = (me.user.name ?? '').split(' ')[0];

	// Primary destinations as cards. The sidebar carries the full nav; this is a focused
	// "where to next" surface on the landing page.
	const quickLinks: QuickLink[] = [
		{
			to: '/opportunities',
			label: 'Offerteaanvragen',
			description: 'Inkomende aanvragen, concepten en opvolging.',
			icon: 'inbox'
		},
		...(!isExternal
			? ([
					{
						to: '/calendar',
						label: 'Kalender',
						description: 'Deadlines, afspraken en verloopdata.',
						icon: 'calendar'
					}
				] as const)
			: []),
		{
			to: '/team',
			label: 'Team',
			description: 'Beheer teamleden en uitnodigingen.',
			icon: 'users'
		},
		...(isOwner
			? ([
					{
						to: '/billing',
						label: 'Abonnement',
						description: 'Plan, facturering en gebruik.',
						icon: 'credit-card'
					}
				] as const)
			: [])
	];

	return (
		<Stack useFlexGap spacing={3}>
			<PageHeader
				title={firstName ? `Welkom terug, ${firstName}` : 'Welkom terug'}
				caption='Een overzicht van je offerteaanvragen en wat er aandacht nodig heeft.'
			/>

			{!isBillingEntitled(billing.state) && <UpsellTeaser isOwner={isOwner} />}

			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
					gap: 2
				}}
			>
				{quickLinks.map(link => (
					<Card key={link.to}>
						<CardActionArea component={Link} to={link.to} sx={{ p: 2.5, height: '100%' }}>
							<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
								<Box
									sx={{
										width: 36,
										height: 36,
										borderRadius: `${tokens.radius.md}px`,
										backgroundColor: tokens.color.accent[50],
										color: tokens.color.accent[700],
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										flexShrink: 0
									}}
								>
									<AppIcon name={link.icon} size='medium' />
								</Box>
								<Box sx={{ minWidth: 0 }}>
									<H3>{link.label}</H3>
									<BodySmall sx={{ mt: 0.5 }}>{link.description}</BodySmall>
								</Box>
							</Box>
						</CardActionArea>
					</Card>
				))}
			</Box>
		</Stack>
	);
}
