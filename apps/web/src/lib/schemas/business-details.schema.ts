import {
	COMPANY_ADDRESS_MAX_LENGTH,
	COMPANY_FOOTER_MAX_LENGTH,
	COMPANY_NAME_MAX_LENGTH,
	COMPANY_PHONE_MAX_LENGTH,
	COMPANY_REGISTRATION_NUMBER_MAX_LENGTH,
	COMPANY_VAT_MAX_LENGTH,
	COMPANY_WEBSITE_MAX_LENGTH,
	PAYMENT_TERMS_DAYS_MAX,
	PAYMENT_TERMS_DAYS_MIN
} from '@offertum/shared';
import z from 'zod';

export const BusinessDetailsSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Vul je bedrijfsnaam in')
		.max(COMPANY_NAME_MAX_LENGTH, `Maximaal ${COMPANY_NAME_MAX_LENGTH} tekens`),
	companyRegistrationNumber: z
		.string()
		.trim()
		.max(COMPANY_REGISTRATION_NUMBER_MAX_LENGTH, `Maximaal ${COMPANY_REGISTRATION_NUMBER_MAX_LENGTH} tekens`),
	companyVatNumber: z.string().trim().max(COMPANY_VAT_MAX_LENGTH, `Maximaal ${COMPANY_VAT_MAX_LENGTH} tekens`),
	companyAddress: z.string().trim().max(COMPANY_ADDRESS_MAX_LENGTH, `Maximaal ${COMPANY_ADDRESS_MAX_LENGTH} tekens`),
	companyPhone: z.string().trim().max(COMPANY_PHONE_MAX_LENGTH, `Maximaal ${COMPANY_PHONE_MAX_LENGTH} tekens`),
	companyWebsite: z.string().trim().max(COMPANY_WEBSITE_MAX_LENGTH, `Maximaal ${COMPANY_WEBSITE_MAX_LENGTH} tekens`),
	companyFooter: z.string().trim().max(COMPANY_FOOTER_MAX_LENGTH, `Maximaal ${COMPANY_FOOTER_MAX_LENGTH} tekens`),
	defaultPaymentTermsDays: z.coerce
		.number({ message: 'Vul een geldig aantal dagen in' })
		.int('Vul een heel getal in')
		.min(PAYMENT_TERMS_DAYS_MIN, `Minimaal ${PAYMENT_TERMS_DAYS_MIN}`)
		.max(PAYMENT_TERMS_DAYS_MAX, `Maximaal ${PAYMENT_TERMS_DAYS_MAX}`)
});

export type BusinessDetailsForm = z.infer<typeof BusinessDetailsSchema>;
