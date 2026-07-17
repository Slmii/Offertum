import {
	COMPANY_ADDRESS_MAX_LENGTH,
	COMPANY_FOOTER_MAX_LENGTH,
	COMPANY_NAME_MAX_LENGTH,
	COMPANY_PHONE_MAX_LENGTH,
	COMPANY_REGISTRATION_NUMBER_MAX_LENGTH,
	COMPANY_VAT_MAX_LENGTH,
	COMPANY_WEBSITE_MAX_LENGTH,
	isValidKvkNumber,
	isValidNlVatNumber,
	isValidWebsite,
	PAYMENT_TERMS_DAYS_MAX,
	PAYMENT_TERMS_DAYS_MIN,
	QUOTE_VALIDITY_DAYS_MAX,
	QUOTE_VALIDITY_DAYS_MIN,
	SUPPORTED_LANGUAGE_VALUES,
	SUPPORTED_TIMEZONE_VALUES,
	VERTICAL_VALUES
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
		.max(COMPANY_REGISTRATION_NUMBER_MAX_LENGTH, `Maximaal ${COMPANY_REGISTRATION_NUMBER_MAX_LENGTH} tekens`)
		.refine(value => value.length === 0 || isValidKvkNumber(value), 'Ongeldig KvK-nummer — 8 cijfers'),
	companyVatNumber: z
		.string()
		.trim()
		.max(COMPANY_VAT_MAX_LENGTH, `Maximaal ${COMPANY_VAT_MAX_LENGTH} tekens`)
		.refine(value => value.length === 0 || isValidNlVatNumber(value), 'Ongeldig BTW-nummer — bijv. NL123456789B01'),
	companyAddress: z.string().trim().max(COMPANY_ADDRESS_MAX_LENGTH, `Maximaal ${COMPANY_ADDRESS_MAX_LENGTH} tekens`),
	companyPhone: z.string().trim().max(COMPANY_PHONE_MAX_LENGTH, `Maximaal ${COMPANY_PHONE_MAX_LENGTH} tekens`),
	companyWebsite: z
		.string()
		.trim()
		.max(COMPANY_WEBSITE_MAX_LENGTH, `Maximaal ${COMPANY_WEBSITE_MAX_LENGTH} tekens`)
		.refine(value => value.length === 0 || isValidWebsite(value), 'Ongeldige website — bijv. jouwbedrijf.nl'),
	companyFooter: z.string().trim().max(COMPANY_FOOTER_MAX_LENGTH, `Maximaal ${COMPANY_FOOTER_MAX_LENGTH} tekens`),
	defaultPaymentTermsDays: z.coerce
		.number({ message: 'Vul een geldig aantal dagen in' })
		.int('Vul een heel getal in')
		.min(PAYMENT_TERMS_DAYS_MIN, `Minimaal ${PAYMENT_TERMS_DAYS_MIN}`)
		.max(PAYMENT_TERMS_DAYS_MAX, `Maximaal ${PAYMENT_TERMS_DAYS_MAX}`),
	quoteValidityDays: z.coerce
		.number({ message: 'Vul een geldig aantal dagen in' })
		.int('Vul een heel getal in')
		.min(QUOTE_VALIDITY_DAYS_MIN, `Minimaal ${QUOTE_VALIDITY_DAYS_MIN}`)
		.max(QUOTE_VALIDITY_DAYS_MAX, `Maximaal ${QUOTE_VALIDITY_DAYS_MAX}`),
	vertical: z.enum(VERTICAL_VALUES),
	language: z.enum(SUPPORTED_LANGUAGE_VALUES),
	timezone: z.enum(SUPPORTED_TIMEZONE_VALUES)
});

export type BusinessDetailsForm = z.infer<typeof BusinessDetailsSchema>;
