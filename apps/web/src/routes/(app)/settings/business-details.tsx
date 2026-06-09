import { apiBlob } from '@/lib/api/client';
import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { Select } from '@/components/Form/Select/Select.component';
import { SectionError } from '@/components/SectionError.component';
import {
	businessDetailsQueryOptions,
	useDeleteBusinessAsset,
	useDeleteOrganization,
	useUpdateBusinessDetails,
	useUploadBusinessAsset
} from '@/lib/queries/business-details.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { BusinessDetailsSchema, type BusinessDetailsForm } from '@/lib/schemas/business-details.schema';
import { type VerticalValue } from '@offertum/shared';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/(app)/settings/business-details')({
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(myMembershipQueryOptions),
			context.queryClient.ensureQueryData(businessDetailsQueryOptions)
		]);
	},
	component: BusinessDetailsSettingsPage,
	errorComponent: SectionError
});

const VERTICAL_LABELS: Record<VerticalValue, string> = {
	LOODGIETER: 'Loodgieter',
	ELEKTRICIEN: 'Elektricien',
	SCHILDER: 'Schilder',
	TIMMERMAN: 'Timmerman / Aannemer',
	DAKDEKKER: 'Dakdekker',
	TEGELZETTER: 'Tegelzetter',
	HOVENIER: 'Hovenier',
	INSTALLATEUR: 'Installateur',
	SCHOONMAAK: 'Schoonmaak',
	OVERIG: 'Overig'
};

const VERTICAL_OPTIONS = (Object.entries(VERTICAL_LABELS) as [VerticalValue, string][]).map(([value, label]) => ({
	id: value,
	label
}));

function BusinessDetailsSettingsPage() {
	const { data } = useSuspenseQuery(businessDetailsQueryOptions);
	const { data: membership } = useSuspenseQuery(myMembershipQueryOptions);
	const update = useUpdateBusinessDetails();
	const uploadLogo = useUploadBusinessAsset('logo');
	const uploadLetterhead = useUploadBusinessAsset('letterhead');
	const deleteLogo = useDeleteBusinessAsset('logo');
	const deleteLetterhead = useDeleteBusinessAsset('letterhead');
	const deleteOrganization = useDeleteOrganization();
	const [savedFlash, setSavedFlash] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState('');
	const [assetPreviewVersion, setAssetPreviewVersion] = useState(0);
	const [pdfPreviewPending, setPdfPreviewPending] = useState(false);
	const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);
	const isOwner = membership.role === 'OWNER';

	const refreshAssetPreview = () => {
		setAssetPreviewVersion(version => version + 1);
	};

	// Render a sample quote PDF (fixed demo line items) so the owner can see how
	// their logo, letterhead, company details, and footer land on an offerte —
	// before the real quote pipeline (W10) exists. Opens the PDF in a new tab.
	const handlePdfPreview = async () => {
		setPdfPreviewError(null);
		setPdfPreviewPending(true);
		try {
			const blob = await apiBlob('/api/quote-pdfs/preview', {
				method: 'POST',
				body: {
					customerName: 'Voorbeeldklant BV',
					customerEmail: 'klant@voorbeeld.nl',
					customerAddress: 'Voorbeeldstraat 1\n1000 AA Amsterdam',
					lineItems: [
						{
							description: 'Voorbeeld: arbeid op locatie',
							unit: 'hour',
							unitPriceEur: '75.00',
							quantity: 8,
							vatRate: 21
						},
						{
							description: 'Voorbeeld: materiaal',
							unit: 'piece',
							unitPriceEur: '120.00',
							quantity: 3,
							vatRate: 21
						},
						{
							description: 'Voorbeeld: voorrijkosten',
							unit: 'flat_fee',
							unitPriceEur: '35.00',
							quantity: 1,
							vatRate: 9
						}
					]
				}
			});
			const url = URL.createObjectURL(blob);
			window.open(url, '_blank', 'noopener,noreferrer');
			// Revoke after a tick so the new tab has time to load the blob.
			window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
		} catch (error) {
			setPdfPreviewError(error instanceof Error ? error.message : 'Voorbeeld-PDF maken mislukt.');
		} finally {
			setPdfPreviewPending(false);
		}
	};

	const onSubmit = (values: BusinessDetailsForm) => {
		if (!isOwner) {
			return;
		}

		update.mutate(
			{
				name: values.name,
				companyRegistrationNumber:
					values.companyRegistrationNumber.length === 0 ? null : values.companyRegistrationNumber,
				companyVatNumber: values.companyVatNumber.length === 0 ? null : values.companyVatNumber,
				companyAddress: values.companyAddress.length === 0 ? null : values.companyAddress,
				companyPhone: values.companyPhone.length === 0 ? null : values.companyPhone,
				companyWebsite: values.companyWebsite.length === 0 ? null : values.companyWebsite,
				companyFooter: values.companyFooter.length === 0 ? null : values.companyFooter,
				defaultPaymentTermsDays: values.defaultPaymentTermsDays,
				quoteValidityDays: values.quoteValidityDays,
				vertical: values.vertical
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
					bedrijfsnaam, adres, contactgegevens, merkbestanden en standaard betalingstermijn hier.
				</Typography>
			</Box>

			<Paper variant='outlined' sx={{ p: 6, borderRadius: 2 }}>
				<Form<BusinessDetailsForm>
					action={onSubmit}
					schema={BusinessDetailsSchema}
					defaultValues={{
						name: data.name,
						companyRegistrationNumber: data.companyRegistrationNumber ?? '',
						companyVatNumber: data.companyVatNumber ?? '',
						companyAddress: data.companyAddress ?? '',
						companyPhone: data.companyPhone ?? '',
						companyWebsite: data.companyWebsite ?? '',
						companyFooter: data.companyFooter ?? '',
						defaultPaymentTermsDays: data.defaultPaymentTermsDays,
						quoteValidityDays: data.quoteValidityDays,
						vertical: data.vertical
					}}
				>
					<Stack useFlexGap spacing={4}>
						{!isOwner && (
							<Alert severity='info'>
								Alleen eigenaren kunnen bedrijfsgegevens, logo en briefpapier aanpassen.
							</Alert>
						)}

						<Field name='name' label='Bedrijfsnaam' fullWidth disabled={!isOwner} />
						<Stack direction='row' useFlexGap spacing={2}>
							<Field name='companyRegistrationNumber' label='KvK-nummer' fullWidth disabled={!isOwner} />
							<Field name='companyVatNumber' label='BTW-nummer' fullWidth disabled={!isOwner} />
						</Stack>
						<Field name='companyAddress' label='Adres' fullWidth multiline disabled={!isOwner} />
						<Stack direction='row' useFlexGap spacing={2}>
							<Field name='companyPhone' label='Telefoonnummer' fullWidth disabled={!isOwner} />
							<Field name='companyWebsite' label='Website' fullWidth disabled={!isOwner} />
						</Stack>
						<Field
							name='defaultPaymentTermsDays'
							label='Standaard betalingstermijn (dagen)'
							type='number'
							fullWidth
							disabled={!isOwner}
						/>
						<Field
							name='quoteValidityDays'
							label='Geldigheidsduur offerte (dagen)'
							type='number'
							fullWidth
							disabled={!isOwner}
						/>
						<Select
							name='vertical'
							label='Branche'
							options={VERTICAL_OPTIONS}
							fullWidth
							disabled={!isOwner}
						/>
						<Field
							name='companyFooter'
							label='Footer (optioneel)'
							helperText='Tekst onderaan je offerte- en factuur-PDF.'
							fullWidth
							multiline
							disabled={!isOwner}
						/>

						{isOwner && update.error && (
							<Alert severity='error'>
								{update.error instanceof Error ? update.error.message : 'Opslaan mislukt.'}
							</Alert>
						)}
						{isOwner && savedFlash && <Alert severity='success'>Opgeslagen.</Alert>}

						{isOwner && (
							<Stack direction='row' useFlexGap spacing={2} sx={{ justifyContent: 'flex-end' }}>
								<Button type='submit' variant='contained' disabled={update.isPending}>
									{update.isPending ? 'Opslaan…' : 'Opslaan'}
								</Button>
							</Stack>
						)}
					</Stack>
				</Form>
			</Paper>

			<Paper variant='outlined' sx={{ p: 6, borderRadius: 2, mt: 4 }}>
				<Stack useFlexGap spacing={4}>
					<Box>
						<Typography variant='h6' component='h2' sx={{ mb: 1 }}>
							Logo en briefpapier
						</Typography>
						<Typography variant='body2' sx={{ color: 'text.secondary' }}>
							Deze bestanden worden gebruikt op offerte-PDF's.
						</Typography>
					</Box>

					<Stack direction={{ xs: 'column', sm: 'row' }} useFlexGap spacing={2}>
						<BusinessAssetControl
							label='Logo'
							previewAlt='Logo'
							previewSrc={`/api/me/business-details/logo?v=${assetPreviewVersion}`}
							previewVariant='logo'
							hasAsset={data.hasLogo}
							isPending={uploadLogo.isPending || deleteLogo.isPending}
							onUpload={file => uploadLogo.mutate(file, { onSuccess: refreshAssetPreview })}
							onDelete={() => deleteLogo.mutate(undefined, { onSuccess: refreshAssetPreview })}
							canEdit={isOwner}
						/>
						<BusinessAssetControl
							label='Briefpapier'
							previewAlt='Briefpapier'
							previewSrc={`/api/me/business-details/letterhead?v=${assetPreviewVersion}`}
							previewVariant='letterhead'
							hasAsset={data.hasLetterhead}
							isPending={uploadLetterhead.isPending || deleteLetterhead.isPending}
							onUpload={file => uploadLetterhead.mutate(file, { onSuccess: refreshAssetPreview })}
							onDelete={() => deleteLetterhead.mutate(undefined, { onSuccess: refreshAssetPreview })}
							canEdit={isOwner}
						/>
					</Stack>

					{isOwner &&
						(uploadLogo.error || uploadLetterhead.error || deleteLogo.error || deleteLetterhead.error) && (
							<Alert severity='error'>Bestand bijwerken mislukt.</Alert>
						)}

					<Divider />

					<Box>
						<Typography variant='body2' sx={{ color: 'text.secondary', mb: 2 }}>
							Bekijk hoe je gegevens op een offerte-PDF verschijnen (met voorbeeldregels).
						</Typography>
						<Button variant='outlined' onClick={handlePdfPreview} disabled={pdfPreviewPending}>
							{pdfPreviewPending ? 'Bezig…' : 'Bekijk voorbeeld-offerte'}
						</Button>
						{pdfPreviewError && (
							<Alert severity='error' sx={{ mt: 2 }}>
								{pdfPreviewError}
							</Alert>
						)}
					</Box>
				</Stack>
			</Paper>

			{isOwner && (
				<Paper variant='outlined' sx={{ p: 6, borderRadius: 2, mt: 4, borderColor: 'error.light' }}>
					<Stack useFlexGap spacing={3}>
						<Box>
							<Typography variant='h6' component='h2' sx={{ color: 'error.main', mb: 1 }}>
								Danger zone
							</Typography>
							<Typography variant='body2' sx={{ color: 'text.secondary' }}>
								Verwijder deze organisatie permanent. Alle leden worden losgekoppeld van deze
								organisatie en organisatiegegevens worden verwijderd.
							</Typography>
						</Box>
						<Divider />
						<TextField
							label='Typ de bedrijfsnaam om te bevestigen'
							value={deleteConfirm}
							onChange={event => setDeleteConfirm(event.target.value)}
							fullWidth
						/>
						{deleteOrganization.error && (
							<Alert severity='error'>
								{deleteOrganization.error instanceof Error
									? deleteOrganization.error.message
									: 'Verwijderen mislukt.'}
							</Alert>
						)}
						<Stack direction='row' sx={{ justifyContent: 'flex-end' }}>
							<Button
								variant='outlined'
								color='error'
								disabled={deleteConfirm !== data.name || deleteOrganization.isPending}
								onClick={() => deleteOrganization.mutate(deleteConfirm)}
							>
								{deleteOrganization.isPending ? 'Verwijderen…' : 'Organisatie verwijderen'}
							</Button>
						</Stack>
					</Stack>
				</Paper>
			)}
		</Container>
	);
}

interface BusinessAssetControlProps {
	label: string;
	previewAlt: string;
	previewSrc: string;
	previewVariant: 'logo' | 'letterhead';
	hasAsset: boolean;
	isPending: boolean;
	canEdit: boolean;
	onUpload: (file: File) => void;
	onDelete: () => void;
}

function BusinessAssetControl({
	label,
	previewAlt,
	previewSrc,
	previewVariant,
	hasAsset,
	isPending,
	canEdit,
	onUpload,
	onDelete
}: BusinessAssetControlProps) {
	return (
		<Box sx={{ p: 3, flex: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
			<Stack useFlexGap spacing={2}>
				<Typography variant='subtitle2'>{label}</Typography>
				{hasAsset ? (
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							overflow: 'hidden',
							minHeight: previewVariant === 'logo' ? 96 : 180,
							aspectRatio: previewVariant === 'logo' ? '3 / 1' : '210 / 297',
							bgcolor: 'background.default',
							border: 1,
							borderColor: 'divider',
							borderRadius: 1
						}}
					>
						<Box
							component='img'
							src={previewSrc}
							alt={previewAlt}
							sx={{
								display: 'block',
								width: '100%',
								height: '100%',
								objectFit: 'contain'
							}}
						/>
					</Box>
				) : (
					<Typography variant='body2' sx={{ color: 'text.secondary' }}>
						Geen bestand ingesteld.
					</Typography>
				)}
				{canEdit && (
					<Stack direction='row' useFlexGap spacing={1}>
						<Button variant='outlined' component='label' disabled={isPending}>
							Upload
							<input
								type='file'
								accept='image/png,image/jpeg,image/webp'
								hidden
								onChange={event => {
									const file = event.target.files?.[0];
									if (file) {
										onUpload(file);
									}
									event.target.value = '';
								}}
							/>
						</Button>
						<Button variant='text' color='error' disabled={!hasAsset || isPending} onClick={onDelete}>
							Verwijder
						</Button>
					</Stack>
				)}
			</Stack>
		</Box>
	);
}
