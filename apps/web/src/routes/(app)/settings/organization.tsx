import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { Banner } from '@/components/Banner.component';
import { Dialog } from '@/components/Dialog.component';
import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { Select } from '@/components/Form/Select/Select.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SectionError } from '@/components/SectionError.component';
import { BodySmall, H3, Label } from '@/components/Text.component';
import { apiBlob } from '@/lib/api/client';
import { useToast } from '@/lib/hooks/use-toast';
import {
	businessDetailsQueryOptions,
	useDeleteBusinessAsset,
	useDeleteOrganization,
	usePurgeOrganizationData,
	useUpdateBusinessDetails,
	useUploadBusinessAsset
} from '@/lib/queries/business-details.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { vatSettingsQueryOptions } from '@/lib/queries/vat-settings.queries';
import { BusinessDetailsSchema, type BusinessDetailsForm } from '@/lib/schemas/business-details.schema';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import type { Theme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import {
	DEFAULT_LANGUAGE,
	DEFAULT_TIMEZONE,
	SUPPORTED_LANGUAGES,
	SUPPORTED_TIMEZONES,
	type SupportedLanguage,
	type SupportedTimezone,
	type UpdateBusinessDetailsInput,
	type VerticalValue
} from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import { VatSettingsSection } from './-VatSettingsSection.component';

export const Route = createFileRoute('/(app)/settings/organization')({
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(myMembershipQueryOptions),
			context.queryClient.ensureQueryData(businessDetailsQueryOptions),
			context.queryClient.ensureQueryData(vatSettingsQueryOptions)
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

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map(({ value, label, disabled }) => ({ id: value, label, disabled }));
const TIMEZONE_OPTIONS = SUPPORTED_TIMEZONES.map(({ value, label }) => ({ id: value, label }));

// Each card is its own form + partial save (owner picked "per section"), so slice the
// full business-details schema per card and PATCH only that card's fields on Opslaan.
const IDENTITY_SCHEMA = BusinessDetailsSchema.pick({
	name: true,
	companyRegistrationNumber: true,
	companyVatNumber: true,
	companyAddress: true,
	vertical: true
});
const CONTACT_SCHEMA = BusinessDetailsSchema.pick({ companyPhone: true, companyWebsite: true });
const LOCALE_SCHEMA = BusinessDetailsSchema.pick({ language: true, timezone: true });
const QUOTE_SETTINGS_SCHEMA = BusinessDetailsSchema.pick({
	defaultPaymentTermsDays: true,
	quoteValidityDays: true,
	companyFooter: true
});

type IdentityForm = Pick<
	BusinessDetailsForm,
	'name' | 'companyRegistrationNumber' | 'companyVatNumber' | 'companyAddress' | 'vertical'
>;
type ContactForm = Pick<BusinessDetailsForm, 'companyPhone' | 'companyWebsite'>;
type LocaleForm = Pick<BusinessDetailsForm, 'language' | 'timezone'>;
type QuoteSettingsForm = Pick<BusinessDetailsForm, 'defaultPaymentTermsDays' | 'quoteValidityDays' | 'companyFooter'>;

function BusinessDetailsSettingsPage() {
	const { data } = useSuspenseQuery(businessDetailsQueryOptions);
	const { data: membership } = useSuspenseQuery(myMembershipQueryOptions);
	const updateIdentity = useUpdateBusinessDetails();
	const updateContact = useUpdateBusinessDetails();
	const updateLocale = useUpdateBusinessDetails();
	const updateQuoteSettings = useUpdateBusinessDetails();
	const uploadLogo = useUploadBusinessAsset('logo');
	const uploadLetterhead = useUploadBusinessAsset('letterhead');
	const deleteLogo = useDeleteBusinessAsset('logo');
	const deleteLetterhead = useDeleteBusinessAsset('letterhead');
	const deleteOrganization = useDeleteOrganization();
	const purgeData = usePurgeOrganizationData();
	const toast = useToast();

	const [deleteOpen, setDeleteOpen] = useState(false);
	const [purgeOpen, setPurgeOpen] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState('');
	const [assetPreviewVersion, setAssetPreviewVersion] = useState(0);
	const [pdfPreviewPending, setPdfPreviewPending] = useState(false);
	const isOwner = membership.role === 'OWNER';

	const refreshAssetPreview = () => {
		setAssetPreviewVersion(version => version + 1);
	};

	const onAssetError = (error: unknown) =>
		toast.error('Bestand bijwerken mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.');

	// Render a sample quote PDF (fixed demo line items) so the owner can see how
	// their logo, letterhead, company details, and footer land on an offerte —
	// before the real quote pipeline (W10) exists. Opens the PDF in a new tab.
	const handlePdfPreview = async () => {
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
			toast.error('Voorbeeld-PDF maken mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.');
		} finally {
			setPdfPreviewPending(false);
		}
	};

	// Empty / whitespace-only strings collapse to null so the DB never stores "".
	const orNull = (value: string) => (value.trim().length === 0 ? null : value);

	const commitSection = (
		mutation: ReturnType<typeof useUpdateBusinessDetails>,
		fields: UpdateBusinessDetailsInput
	) => {
		if (!isOwner) {
			return;
		}

		mutation.mutate(fields, {
			onSuccess: () => toast.success('Opgeslagen', 'Je wijzigingen zijn bewaard.'),
			onError: error =>
				toast.error('Opslaan mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.')
		});
	};

	const saveIdentity = (values: IdentityForm) =>
		commitSection(updateIdentity, {
			name: values.name,
			companyRegistrationNumber: orNull(values.companyRegistrationNumber),
			companyVatNumber: orNull(values.companyVatNumber),
			companyAddress: orNull(values.companyAddress),
			vertical: values.vertical
		});

	const saveContact = (values: ContactForm) =>
		commitSection(updateContact, {
			companyPhone: orNull(values.companyPhone),
			companyWebsite: orNull(values.companyWebsite)
		});

	const saveLocale = (values: LocaleForm) =>
		commitSection(updateLocale, { language: values.language, timezone: values.timezone });

	const saveQuoteSettings = (values: QuoteSettingsForm) =>
		commitSection(updateQuoteSettings, {
			defaultPaymentTermsDays: values.defaultPaymentTermsDays,
			quoteValidityDays: values.quoteValidityDays,
			companyFooter: orNull(values.companyFooter)
		});

	const closeDeleteDialog = () => {
		if (deleteOrganization.isPending) {
			return;
		}

		setDeleteOpen(false);
		setDeleteConfirm('');
	};

	const confirmDeleteOrganization = () => {
		deleteOrganization.mutate(deleteConfirm, {
			onError: error =>
				toast.error('Verwijderen mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.')
		});
	};

	const closePurgeDialog = () => {
		if (purgeData.isPending) {
			return;
		}

		setPurgeOpen(false);
	};

	const confirmPurgeData = () => {
		purgeData.mutate(undefined, {
			onSuccess: () => {
				setPurgeOpen(false);
				toast.success(
					'Ingelezen e-mails verwijderd',
					'Alle aanvragen, concepten en offertes zijn gewist. Nieuwe e-mails worden opnieuw ingelezen.'
				);
			},
			onError: error =>
				toast.error('Verwijderen mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.')
		});
	};

	return (
		<Stack>
			<PageHeader
				title='Organisatie'
				caption='Bedrijfsgegevens en standaardinstellingen. Deze gegevens verschijnen op de afzender van je concept-antwoorden en op offertes.'
			/>

			<Stack useFlexGap spacing={4}>
				{!isOwner && (
					<Banner tone='info'>
						Alleen eigenaren kunnen organisatiegegevens, logo en briefpapier aanpassen.
					</Banner>
				)}

				<CardSection
					title='Identiteit'
					caption='De naam en registratiegegevens die klanten zien op je antwoorden en offerte-PDF.'
				>
					<Form<IdentityForm>
						action={saveIdentity}
						schema={IDENTITY_SCHEMA}
						defaultValues={{
							name: data.name,
							companyRegistrationNumber: data.companyRegistrationNumber ?? '',
							companyVatNumber: data.companyVatNumber ?? '',
							companyAddress: data.companyAddress ?? '',
							vertical: data.vertical
						}}
					>
						<Box sx={{ p: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
							<Field name='name' fullWidth label='Bedrijfsnaam' disabled={!isOwner} required />
							<Select
								name='vertical'
								options={VERTICAL_OPTIONS}
								fullWidth
								label='Branche'
								disabled={!isOwner}
								required
							/>
							<Field name='companyRegistrationNumber' fullWidth label='KvK-nummer' disabled={!isOwner} />
							<Field name='companyVatNumber' fullWidth label='BTW-nummer' disabled={!isOwner} />
							<Box sx={{ gridColumn: '1 / -1' }}>
								<Field
									name='companyAddress'
									fullWidth
									multiline
									label='Bezoekadres'
									disabled={!isOwner}
									minRows={3}
								/>
							</Box>
						</Box>
						{isOwner && <SectionSaveFooter isPending={updateIdentity.isPending} />}
					</Form>
				</CardSection>

				<CardSection
					title='Contact'
					caption='Standaard telefoon en website die Offertum in je handtekening verwerkt.'
				>
					<Form<ContactForm>
						action={saveContact}
						schema={CONTACT_SCHEMA}
						defaultValues={{
							companyPhone: data.companyPhone ?? '',
							companyWebsite: data.companyWebsite ?? ''
						}}
					>
						<Box sx={{ p: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
							<Field
								name='companyPhone'
								fullWidth
								label='Telefoonnummer'
								startElement={<AppIcon name='phone' />}
								disabled={!isOwner}
							/>
							<Field
								name='companyWebsite'
								fullWidth
								label='Website'
								startElement={<AppIcon name='world' />}
								disabled={!isOwner}
							/>
						</Box>
						{isOwner && <SectionSaveFooter isPending={updateContact.isPending} />}
					</Form>
				</CardSection>

				<CardSection title='Taal & tijdzone' caption='Je standaardtaal en tijdzone voor deze organisatie.'>
					<Form<LocaleForm>
						action={saveLocale}
						schema={LOCALE_SCHEMA}
						defaultValues={{
							language: (data.language as SupportedLanguage) ?? DEFAULT_LANGUAGE,
							timezone: (data.timezone as SupportedTimezone) ?? DEFAULT_TIMEZONE
						}}
					>
						<Box sx={{ p: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
							<Select
								name='language'
								options={LANGUAGE_OPTIONS}
								fullWidth
								label='Standaardtaal'
								startElement={<AppIcon name='language' />}
								disabled={!isOwner}
								required
							/>
							<Select
								name='timezone'
								options={TIMEZONE_OPTIONS}
								fullWidth
								label='Tijdzone'
								startElement={<AppIcon name='clock' />}
								disabled={!isOwner}
								required
							/>
						</Box>
						{isOwner && <SectionSaveFooter isPending={updateLocale.isPending} />}
					</Form>
				</CardSection>

				<CardSection title='Offerte-instellingen' caption='Standaardwaarden voor nieuwe offertes.'>
					<Form<QuoteSettingsForm>
						action={saveQuoteSettings}
						schema={QUOTE_SETTINGS_SCHEMA}
						defaultValues={{
							defaultPaymentTermsDays: data.defaultPaymentTermsDays,
							quoteValidityDays: data.quoteValidityDays,
							companyFooter: data.companyFooter ?? ''
						}}
					>
						<Box sx={{ p: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
							<Field
								name='defaultPaymentTermsDays'
								type='number'
								fullWidth
								label='Betalingstermijn (dagen)'
								helperText='Aantal dagen dat de klant heeft om te betalen na factuurdatum.'
								startElement={<AppIcon name='calendar-clock' />}
								disabled={!isOwner}
								required
							/>
							<Field
								name='quoteValidityDays'
								type='number'
								fullWidth
								label='Geldigheidsduur offerte (dagen)'
								helperText="Hoe lang de offerte geldig blijft. Daarna krijgt 'ie de status Verlopen."
								startElement={<AppIcon name='clock' />}
								disabled={!isOwner}
								required
							/>
							<Box sx={{ gridColumn: '1 / -1' }}>
								<Field
									name='companyFooter'
									fullWidth
									multiline
									label='Footer op offerte-PDF'
									helperText='Verschijnt onderaan elke pagina van de offerte-PDF.'
									disabled={!isOwner}
								/>
							</Box>
						</Box>
						{isOwner && <SectionSaveFooter isPending={updateQuoteSettings.isPending} />}
					</Form>
				</CardSection>

				<VatSettingsSection isOwner={isOwner} />

				<CardSection
					title='Logo & briefpapier'
					caption='Gebruikt op de offerte-PDF en in de footer van je verzonden e-mails.'
				>
					<Box sx={{ display: 'flex', flexDirection: 'column' }}>
						<BusinessAssetRow
							icon='image'
							previewAlt='Logo'
							previewSrc={`/api/me/business-details/logo?v=${assetPreviewVersion}`}
							hasAsset={data.hasLogo}
							stateText={data.hasLogo ? 'Logo ingesteld.' : 'Geen logo geüpload.'}
							hint='PNG, JPG of WEBP. Minimaal 512×512px, transparante achtergrond aanbevolen.'
							uploadLabel='Upload logo'
							isPending={uploadLogo.isPending || deleteLogo.isPending}
							canEdit={isOwner}
							onUpload={file =>
								uploadLogo.mutate(file, { onSuccess: refreshAssetPreview, onError: onAssetError })
							}
							onDelete={() =>
								deleteLogo.mutate(undefined, { onSuccess: refreshAssetPreview, onError: onAssetError })
							}
						/>
						<BusinessAssetRow
							icon='file-text'
							a4
							previewAlt='Briefpapier'
							previewSrc={`/api/me/business-details/letterhead?v=${assetPreviewVersion}`}
							hasAsset={data.hasLetterhead}
							stateText={data.hasLetterhead ? 'Briefpapier ingesteld.' : 'Geen briefpapier geüpload.'}
							hint='PNG, JPG of WEBP op A4-formaat (min. 1240×1754px). Je logo en gegevens worden hierop geplaatst. Laat je dit leeg, dan verschijnt er geen briefpapier op de offerte.'
							uploadLabel='Upload briefpapier'
							isPending={uploadLetterhead.isPending || deleteLetterhead.isPending}
							canEdit={isOwner}
							onUpload={file =>
								uploadLetterhead.mutate(file, { onSuccess: refreshAssetPreview, onError: onAssetError })
							}
							onDelete={() =>
								deleteLetterhead.mutate(undefined, {
									onSuccess: refreshAssetPreview,
									onError: onAssetError
								})
							}
							isLast
						/>
					</Box>

					<Box
						sx={theme => ({
							py: 1.5,
							px: 3,
							borderTop: `1px solid ${theme.tokens.color.line}`,
							bgcolor: theme.tokens.color.paper2,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: 2
						})}
					>
						<BodySmall color='textSecondary' sx={{ fontSize: 12 }}>
							Bekijk hoe je gegevens op een offerte-PDF verschijnen (met voorbeeldregels).
						</BodySmall>
						<Button
							variant='contained'
							onClick={handlePdfPreview}
							disabled={pdfPreviewPending}
							startIcon={<AppIcon name='external-link' size='small' />}
							sx={{ flexShrink: 0 }}
						>
							{pdfPreviewPending ? 'Bezig…' : 'Voorbeeld bekijken'}
						</Button>
					</Box>
				</CardSection>

				{isOwner && (
					<CardSection
						title='Gevarenzone'
						caption='Acties die niet ongedaan gemaakt kunnen worden.'
						titleColor='error'
						headerBgcolor={theme => theme.tokens.color.lost[50]}
					>
						<Stack useFlexGap spacing={3} sx={{ p: 3 }}>
							<Stack
								direction={{ xs: 'column', sm: 'row' }}
								useFlexGap
								spacing={2}
								sx={{ alignItems: { sm: 'center' } }}
							>
								<Box sx={{ flex: 1 }}>
									<Label component='p' sx={{ mb: 0.5 }}>
										Verwijder alle ingelezen e-mails uit Offertum
									</Label>
									<BodySmall color='textSecondary'>
										Klantgegevens, concepten en geschiedenis worden gewist. Je mailbox-koppelingen
										blijven actief — nieuwe e-mails worden opnieuw ingelezen.
									</BodySmall>
								</Box>
								<Button
									variant='contained'
									color='error'
									startIcon={<AppIcon name='trash' size='small' />}
									sx={{ flexShrink: 0 }}
									onClick={() => setPurgeOpen(true)}
								>
									Verwijder data
								</Button>
							</Stack>

							<Divider />

							<Stack
								direction={{ xs: 'column', sm: 'row' }}
								useFlexGap
								spacing={2}
								sx={{ alignItems: { sm: 'center' } }}
							>
								<Box sx={{ flex: 1 }}>
									<Label component='p' sx={{ mb: 0.5 }}>
										Verwijder organisatie permanent
									</Label>
									<BodySmall color='textSecondary'>
										Alle leden worden losgekoppeld en alle organisatiegegevens worden gewist. Een
										geannuleerd abonnement loopt door tot het einde van de periode.
									</BodySmall>
								</Box>
								<Button
									variant='contained'
									color='error'
									startIcon={<AppIcon name='trash' size='small' />}
									sx={{ flexShrink: 0 }}
									onClick={() => setDeleteOpen(true)}
								>
									Organisatie verwijderen
								</Button>
							</Stack>
						</Stack>
					</CardSection>
				)}
			</Stack>

			<Dialog
				open={deleteOpen}
				title='Organisatie verwijderen'
				onClose={closeDeleteDialog}
				disableClose={deleteOrganization.isPending}
				action={
					<>
						<Button variant='outlined' onClick={closeDeleteDialog} disabled={deleteOrganization.isPending}>
							Annuleren
						</Button>
						<Button
							variant='contained'
							color='error'
							disabled={deleteConfirm !== data.name || deleteOrganization.isPending}
							onClick={confirmDeleteOrganization}
						>
							{deleteOrganization.isPending ? 'Verwijderen…' : 'Definitief verwijderen'}
						</Button>
					</>
				}
			>
				<Stack useFlexGap spacing={2}>
					<BodySmall color='textSecondary'>
						Alle leden worden losgekoppeld en alle organisatiegegevens — aanvragen, concepten, offertes en
						instellingen — worden permanent gewist. Een geannuleerd abonnement loopt door tot het einde van
						de periode. Deze actie kan niet ongedaan worden gemaakt.
					</BodySmall>
					<TextField
						label={`Typ "${data.name}" om te bevestigen`}
						value={deleteConfirm}
						onChange={event => setDeleteConfirm(event.target.value)}
						fullWidth
						autoFocus
						autoComplete='off'
					/>
				</Stack>
			</Dialog>

			<Dialog
				open={purgeOpen}
				title='Ingelezen e-mails verwijderen'
				onClose={closePurgeDialog}
				disableClose={purgeData.isPending}
				action={
					<>
						<Button variant='outlined' onClick={closePurgeDialog} disabled={purgeData.isPending}>
							Annuleren
						</Button>
						<Button
							variant='contained'
							color='error'
							onClick={confirmPurgeData}
							disabled={purgeData.isPending}
						>
							{purgeData.isPending ? 'Verwijderen…' : 'Ja, verwijder alles'}
						</Button>
					</>
				}
			>
				<BodySmall color='textSecondary'>
					Alle ingelezen e-mails, aanvragen, concepten en offertes worden permanent gewist. Je
					mailbox-koppelingen blijven actief — alleen nieuwe e-mails worden opnieuw ingelezen. Deze actie kan
					niet ongedaan worden gemaakt.
				</BodySmall>
			</Dialog>
		</Stack>
	);
}

interface CardSectionProps {
	title: string;
	caption?: ReactNode;
	headerAction?: ReactNode;
	titleColor?: string;
	headerBgcolor?: (theme: Theme) => string;
	children: ReactNode;
}

function CardSection({ title, caption, headerAction, titleColor, headerBgcolor, children }: CardSectionProps) {
	return (
		<Paper variant='outlined' sx={{ p: 0, overflow: 'hidden' }}>
			<Box
				sx={[
					theme => ({
						py: 2.5,
						px: 3,
						borderBottom: `1px solid ${theme.tokens.color.line}`,
						display: 'flex',
						alignItems: 'flex-start',
						justifyContent: 'space-between',
						gap: 2
					}),
					headerBgcolor ? theme => ({ bgcolor: headerBgcolor(theme) }) : false
				]}
			>
				<Box>
					<H3 component='h2' fontWeight='medium' color={titleColor} sx={{ fontSize: 16 }}>
						{title}
					</H3>
					{caption && (
						<BodySmall color='textSecondary' sx={{ display: 'block', mt: 0.5, fontSize: 12 }}>
							{caption}
						</BodySmall>
					)}
				</Box>
				{headerAction}
			</Box>
			{children}
		</Paper>
	);
}

/**
 * Save bar pinned to the bottom of each section's form: Annuleren resets the section
 * back to its saved values, Opslaan submits that section's partial PATCH. Rendered
 * inside `<Form>` so it can reach the section's react-hook-form context. The `mt: -2`
 * cancels the `FormGroup`'s gap so the bar sits flush under the fields.
 */
function SectionSaveFooter({ isPending }: { isPending: boolean }) {
	const { reset } = useFormContext();

	return (
		<Box
			sx={theme => ({
				mt: -2,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'flex-end',
				gap: 1.25,
				py: 1.5,
				px: 3,
				borderTop: `1px solid ${theme.tokens.color.line}`,
				bgcolor: theme.tokens.color.paper2
			})}
		>
			<Button variant='outlined' onClick={() => reset()} disabled={isPending}>
				Annuleren
			</Button>
			<Button type='submit' variant='contained' startIcon={<AppIcon name='check' />} disabled={isPending}>
				Opslaan
			</Button>
		</Box>
	);
}

interface BusinessAssetRowProps {
	icon: AppIconName;
	previewAlt: string;
	previewSrc: string;
	stateText: string;
	hint: string;
	uploadLabel: string;
	hasAsset: boolean;
	isPending: boolean;
	canEdit: boolean;
	isLast?: boolean;
	a4?: boolean;
	onUpload: (file: File) => void;
	onDelete: () => void;
}

/**
 * A single asset row (logo / letterhead): a preview tile — the uploaded asset or a dashed
 * placeholder — beside its state, hint, and actions (upload, delete). The tile is an 88×88 square
 * by default, or an A4 portrait rectangle when `a4` is set (letterhead). Members see it read-only.
 */
function BusinessAssetRow({
	icon,
	previewAlt,
	previewSrc,
	stateText,
	hint,
	uploadLabel,
	hasAsset,
	isPending,
	canEdit,
	isLast,
	a4,
	onUpload,
	onDelete
}: BusinessAssetRowProps) {
	return (
		<Box
			sx={theme => ({
				p: 3,
				display: 'flex',
				alignItems: 'center',
				gap: 2.5,
				borderBottom: isLast ? 'none' : `1px solid ${theme.tokens.color.line}`
			})}
		>
			<Box
				sx={theme => ({
					width: 88,
					height: a4 ? 124 : 88,
					flexShrink: 0,
					borderRadius: `${theme.tokens.radius.md}px`,
					overflow: 'hidden',
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					bgcolor: theme.tokens.color.paper2,
					border: hasAsset
						? `1px solid ${theme.tokens.color.line}`
						: `1px dashed ${theme.tokens.color.lineStrong}`,
					color: theme.tokens.color.ink4
				})}
			>
				{hasAsset ? (
					<Box
						component='img'
						src={previewSrc}
						alt={previewAlt}
						sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
					/>
				) : (
					<AppIcon name={icon} size='large' />
				)}
			</Box>

			<Box sx={{ flex: 1, minWidth: 0 }}>
				<BodySmall fontWeight='medium' sx={{ display: 'block' }}>
					{stateText}
				</BodySmall>
				<BodySmall color='textSecondary' sx={{ display: 'block', mt: 0.5, fontSize: 12 }}>
					{hint}
				</BodySmall>
				<Stack direction='row' useFlexGap spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
					{canEdit && (
						<Button
							variant='outlined'
							component='label'
							disabled={isPending}
							startIcon={<AppIcon name='upload' size='small' />}
						>
							{uploadLabel}
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
					)}
					{canEdit && hasAsset && (
						<Button variant='text' color='error' onClick={onDelete} disabled={isPending}>
							Verwijder
						</Button>
					)}
				</Stack>
			</Box>
		</Box>
	);
}
