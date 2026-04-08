import type { Attachment } from '$lib/types/attachment';
import { fetchFilePreview, type StoredUploadFile } from '$lib/services/files-api';

export function isStoredImageFile(file: StoredUploadFile): boolean {
	return file.contentType.startsWith('image/');
}

export async function resolveStoredFileAttachment(
	file: StoredUploadFile,
	previewCache?: Map<string, string | null>
): Promise<Attachment> {
	const attachment: Attachment = {
		url: file.url,
		name: file.originalName,
		contentType: file.contentType,
		size: file.size,
		hash: file.hash,
		lastModified: file.lastModified
	};

	if (isStoredImageFile(file)) {
		return attachment;
	}

	const cachedContent = previewCache?.get(file.url);
	if (cachedContent !== undefined) {
		return {
			...attachment,
			content: cachedContent ?? undefined
		};
	}

	const payload = await fetchFilePreview(file.url);
	if (previewCache) {
		previewCache.set(file.url, payload.content);
	}

	return {
		...attachment,
		content: payload.content ?? undefined
	};
}
