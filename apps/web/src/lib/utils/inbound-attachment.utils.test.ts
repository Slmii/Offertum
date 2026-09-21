import { describe, expect, it } from 'vitest';
import { toReadableInboundAttachmentStatus } from './inbound-attachment.utils';

describe('toReadableInboundAttachmentStatus', () => {
	it('renders parsed, fully read', () => {
		expect(toReadableInboundAttachmentStatus('parsed', false)).toBe('Gelezen door Offertum');
	});

	it('renders parsed, truncated', () => {
		expect(toReadableInboundAttachmentStatus('parsed', true)).toBe('Gelezen door Offertum (gedeeltelijk)');
	});

	it('renders every non-parsed status', () => {
		expect(toReadableInboundAttachmentStatus('pending', false)).toBe('Niet gelezen');
		expect(toReadableInboundAttachmentStatus('empty', false)).toBe('Niet leesbaar — scan of afbeelding zonder tekst');
		expect(toReadableInboundAttachmentStatus('unsupported', false)).toBe('Bestandstype wordt niet gelezen');
		expect(toReadableInboundAttachmentStatus('too_large', false)).toBe('Te groot om te lezen');
		expect(toReadableInboundAttachmentStatus('encrypted', false)).toBe('Beveiligd met wachtwoord');
		expect(toReadableInboundAttachmentStatus('failed', false)).toBe('Kon niet worden gelezen');
	});
});
