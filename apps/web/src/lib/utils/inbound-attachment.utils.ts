import type { InboundAttachmentStatus } from '@offertum/shared';

/**
 * Dutch status label for an inbound customer attachment on the opportunity detail
 * page's "Bijlagen van de klant" card. `isTruncated` only matters for `parsed` —
 * every other status already communicates that the content wasn't (fully) read.
 */
export const toReadableInboundAttachmentStatus = (
	status: InboundAttachmentStatus,
	isTruncated: boolean
): string => {
	switch (status) {
		case 'parsed':
			return isTruncated ? 'Gelezen door Offertum (gedeeltelijk)' : 'Gelezen door Offertum';
		case 'pending':
			return 'Niet gelezen';
		case 'empty':
			return 'Niet leesbaar — scan of afbeelding zonder tekst';
		case 'unsupported':
			return 'Bestandstype wordt niet gelezen';
		case 'too_large':
			return 'Te groot om te lezen';
		case 'encrypted':
			return 'Beveiligd met wachtwoord';
		case 'failed':
			return 'Kon niet worden gelezen';
	}
};
