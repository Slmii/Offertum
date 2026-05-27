import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { SectionError } from '@/components/SectionError.component';
import { businessDetailsQueryOptions, useUpdateBusinessDetails } from '@/lib/queries/business-details.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { BusinessDetailsSchema, type BusinessDetailsForm } from '@/lib/schemas/business-details.schema';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/(app)/settings/business-details')({
	beforeLoad: async ({ context }) => {
		const me = await context.queryClient.ensureQueryData(myMembershipQueryOptions);
		if (me.role !== 'OWNER') {
			throw redirect({ to: '/' });
		}
	},
	loader: ({ context }) => context.queryClient.ensureQueryData(businessDetailsQueryOptions),
	component: BusinessDetailsSettingsPage,
	errorComponent: SectionError
});

function BusinessDetailsSettingsPage() {
	const { data } = useSuspenseQuery(businessDetailsQueryOptions);
	const update = useUpdateBusinessDetails();
	const [savedFlash, setSavedFlash] = useState(false);

	const onSubmit = (values: BusinessDetailsForm) => {
		update.mutate(
			{
				companyName: values.companyName.length === 0 ? null : values.companyName,
				companyRegistrationNumber:
					values.companyRegistrationNumber.length === 0 ? null : values.companyRegistrationNumber,
				companyVatNumber: values.companyVatNumber.length === 0 ? null : values.companyVatNumber,
				companyAddress: values.companyAddress.length === 0 ? null : values.companyAddress,
				companyFooter: values.companyFooter.length === 0 ? null : values.companyFooter,
				defaultPaymentTermsDays: values.defaultPaymentTermsDays
			},
			{
				onSuccess: () => {
					setSavedFlash(true);
					window.setTimeout(() => setSavedFlash(false), 2500);
				}
			}
		);
	};

	return (
		<Container maxWidth='sm' sx={{ py: 6 }}>
			<Box sx={{ mb: 6 }}>
				<Typography variant='h4' component='h1' sx={{ mb: 2 }}>
					Bedrijfsgegevens
				</Typography>
				<Typography variant='body2' sx={{ color: 'text.secondary', maxWidth: 480 }}>
					De klantgerichte gegevens die op je offertes en facturen verschijnen. Bewaar je officiële
					bedrijfsnaam, KvK-nummer, BTW-nummer, adres en standaard betalingstermijn hier.
				</Typography>
			</Box>

			<Paper variant='outlined' sx={{ p: 6, borderRadius: 2 }}>
				<Form<BusinessDetailsForm>
					action={onSubmit}
					schema={BusinessDetailsSchema}
					defaultValues={{
						companyName: data.companyName ?? '',
						companyRegistrationNumber: data.companyRegistrationNumber ?? '',
						companyVatNumber: data.companyVatNumber ?? '',
						companyAddress: data.companyAddress ?? '',
						companyFooter: data.companyFooter ?? '',
						defaultPaymentTermsDays: data.defaultPaymentTermsDays
					}}
				>
					<Stack spacing={4}>
						<Field name='companyName' label='Bedrijfsnaam' fullWidth />
						<Stack direction='row' spacing={2}>
							<Field name='companyRegistrationNumber' label='KvK-nummer' fullWidth />
							<Field name='companyVatNumber' label='BTW-nummer' fullWidth />
						</Stack>
						<Field name='companyAddress' label='Adres' fullWidth multiline />
						<Field
							name='defaultPaymentTermsDays'
							label='Standaard betalingstermijn (dagen)'
							type='number'
							fullWidth
						/>
						<Field
							name='companyFooter'
							label='Footer (optioneel)'
							helperText='Tekst onderaan je offerte- en factuur-PDF.'
							fullWidth
							multiline
						/>

						{update.error && (
							<Alert severity='error'>
								{update.error instanceof Error ? update.error.message : 'Opslaan mislukt.'}
							</Alert>
						)}
						{savedFlash && <Alert severity='success'>Opgeslagen.</Alert>}

						<Stack direction='row' spacing={2} sx={{ justifyContent: 'flex-end' }}>
							<Button type='submit' variant='contained' disabled={update.isPending}>
								{update.isPending ? 'Opslaan…' : 'Opslaan'}
							</Button>
						</Stack>
					</Stack>
				</Form>
			</Paper>
		</Container>
	);
}
