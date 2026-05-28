export const BUSINESS_ASSET_ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const BUSINESS_ASSET_MAX_FILE_BYTES = 5 * 1024 * 1024;

export type BusinessAssetKind = 'logo' | 'letterhead';

export interface BusinessAssetFile {
	originalname: string;
	mimetype: string;
	size: number;
	buffer: Buffer;
}
