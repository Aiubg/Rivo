import { getServerContainer } from '$lib/server/composition/server-container';
import { upsertUploadMetadata as upsertUploadMetadataRecord } from '$lib/server/domain/files/metadata-repository';
import type { UploadAccessScope } from '$lib/server/uploads/access';

export type { StoredUploadFile } from '$lib/server/app/files/service';

export function parseUploadUrl(url: string): string | null {
	return getServerContainer().services.files.parseUploadUrl(url);
}

export async function listStoredUploads(scope: UploadAccessScope = { type: 'unscoped' }) {
	return getServerContainer().services.files.listUploads(scope);
}

export async function upsertUploadMetadata(entry: {
	url: string;
	originalName: string;
	contentType: string;
	size: number;
	lastModified: number;
	hash?: string;
	uploadedAt?: number;
	userId?: string | null;
	anonymousSessionId?: string | null;
}) {
	const storageKey = parseUploadUrl(entry.url);
	if (!storageKey) {
		throw new Error(`Invalid upload URL: ${entry.url}`);
	}

	return upsertUploadMetadataRecord({
		storageKey,
		originalName: entry.originalName,
		contentType: entry.contentType,
		size: entry.size,
		lastModified: entry.lastModified,
		hash: entry.hash,
		uploadedAt: entry.uploadedAt ?? Date.now(),
		userId: entry.userId ?? null,
		anonymousSessionId: entry.anonymousSessionId ?? null
	});
}

export async function renameUploadMetadata(
	url: string,
	originalName: string,
	scope: UploadAccessScope = { type: 'unscoped' }
) {
	return getServerContainer().services.files.renameUpload(url, originalName, scope);
}

export async function removeUploadMetadata(
	url: string,
	scope: UploadAccessScope = { type: 'unscoped' }
) {
	return getServerContainer().services.files.removeUpload(url, scope);
}

export async function assertUploadAccess(
	url: string,
	scope: UploadAccessScope = { type: 'unscoped' }
) {
	return getServerContainer().services.files.assertUploadAccess(url, scope);
}

export async function getUploadPreview(
	url: string,
	scope: UploadAccessScope = { type: 'unscoped' }
) {
	return getServerContainer().services.files.getUploadPreview(url, scope);
}
