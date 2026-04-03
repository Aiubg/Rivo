import type { Attachment } from '$lib/types/attachment';
import { fetchWithTimeout } from '$lib/utils/network';

type UploadResponse = {
	url?: unknown;
	pathname?: unknown;
	contentType?: unknown;
	content?: unknown;
	size?: unknown;
	message?: unknown;
	hash?: unknown;
	lastModified?: unknown;
};

export type UploadAttachmentResult =
	| {
			ok: true;
			attachment: Attachment;
	  }
	| {
			ok: false;
			aborted?: boolean;
			errorKey: string;
	  };

export function getFileUploadKey(file: File): string {
	return `${file.name}:${file.size}:${file.lastModified}`;
}

function toUploadAttachment(data: UploadResponse): Attachment | null {
	if (
		typeof data.url !== 'string' ||
		typeof data.pathname !== 'string' ||
		typeof data.contentType !== 'string'
	) {
		return null;
	}

	return {
		url: data.url,
		name: data.pathname,
		contentType: data.contentType,
		content: typeof data.content === 'string' ? data.content : undefined,
		size: typeof data.size === 'number' ? data.size : undefined,
		hash: typeof data.hash === 'string' ? data.hash : undefined,
		lastModified: typeof data.lastModified === 'number' ? data.lastModified : undefined
	};
}

async function readUploadErrorMessage(
	response: Response,
	fallback = 'upload.failed'
): Promise<string> {
	const rawText = await response.text().catch(() => '');
	if (!rawText) {
		return fallback;
	}

	try {
		const parsed = JSON.parse(rawText) as { message?: unknown };
		if (typeof parsed.message === 'string') {
			return parsed.message;
		}
	} catch {
		// Fall back to the raw response text when the body is not JSON.
	}

	return rawText;
}

export async function uploadAttachmentFile(
	file: File,
	controller: AbortController
): Promise<UploadAttachmentResult> {
	const formData = new FormData();
	formData.append('file', file);

	try {
		const response = await fetchWithTimeout('/api/files/upload', {
			method: 'POST',
			body: formData,
			timeout: 30000,
			retries: 1,
			signal: controller.signal
		});

		if (!response.ok) {
			return {
				ok: false,
				errorKey: await readUploadErrorMessage(response)
			};
		}

		const data: UploadResponse = await response.json();
		const attachment = toUploadAttachment(data);
		if (!attachment) {
			return {
				ok: false,
				errorKey: 'upload.invalid_response'
			};
		}

		return {
			ok: true,
			attachment
		};
	} catch (error) {
		if ((error as Error).name === 'AbortError') {
			return {
				ok: false,
				aborted: true,
				errorKey: 'upload.aborted'
			};
		}

		throw error;
	}
}
