import { describe, expect, it } from 'vitest';
import {
	ALLOWED_UPLOAD_MIME_TYPES,
	IMAGE_UPLOAD_INPUT_ACCEPT,
	isAllowedUploadFile,
	isUploadImageFile
} from '$lib/utils/upload-constraints';

describe('upload constraints', () => {
	it('keeps image accept values aligned with the server allowlist', () => {
		expect(ALLOWED_UPLOAD_MIME_TYPES).toContain('image/png');
		expect(ALLOWED_UPLOAD_MIME_TYPES).not.toContain('image/svg+xml');
		expect(IMAGE_UPLOAD_INPUT_ACCEPT).not.toContain('image/svg+xml');
	});

	it('rejects unsupported image formats before upload', () => {
		expect(isAllowedUploadFile(new File(['svg'], 'chart.svg', { type: 'image/svg+xml' }))).toBe(
			false
		);
		expect(isUploadImageFile(new File(['png'], 'photo.png', { type: '' }))).toBe(true);
	});
});
