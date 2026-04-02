import { parseAttachmentText } from '$lib/server/files/parse-attachment';
import {
	getUploadMetadataByKey,
	listUploadMetadata,
	removeUploadMetadata as removeUploadMetadataRecord,
	renameUploadMetadata as renameUploadMetadataRecord,
	type UploadMetadataRecord,
	upsertUploadMetadata as upsertUploadMetadataRecord
} from '$lib/server/domain/files/metadata-repository';
import type { StoragePort } from '$lib/server/ports/storage';
import { UploadForbiddenError, UploadNotFoundError } from '$lib/server/errors/upload';
import { matchesUploadOwnership, type UploadAccessScope } from '$lib/server/uploads/access';
import { getFileExtension, guessContentType, supportsTextDecoding } from '$lib/utils/files';

const MAX_PREVIEW_CHARS = 200_000;

export type StoredUploadFile = {
	url: string;
	storedName: string;
	originalName: string;
	contentType: string;
	size: number;
	lastModified: number;
	uploadedAt: number;
	hash?: string;
};

type SaveUploadInput = {
	file: File;
	scope: UploadAccessScope;
};

type SaveUploadResult = {
	url: string;
	pathname: string;
	contentType: string;
	content?: string;
	size: number;
	hash: string;
	lastModified: number;
};

function clampPreview(text: string): string {
	if (text.length <= MAX_PREVIEW_CHARS) return text;
	return `${text.slice(0, MAX_PREVIEW_CHARS)}\n\n[Preview truncated at ${MAX_PREVIEW_CHARS} characters]`;
}

function normalizeLineEndings(text: string): string {
	return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function applyUploadOwnership(
	record: UploadMetadataRecord,
	scope: UploadAccessScope
): UploadMetadataRecord {
	if (scope.type === 'user') {
		return {
			...record,
			userId: scope.userId,
			anonymousSessionId: null
		};
	}

	if (scope.type === 'anonymous') {
		return {
			...record,
			userId: null,
			anonymousSessionId: scope.anonymousSessionId
		};
	}

	return {
		...record,
		userId: null,
		anonymousSessionId: null
	};
}

function isSafeStorageKey(key: string): boolean {
	return key.length > 0 && !key.includes('..') && !key.startsWith('/');
}

function toStoredUploadFile(storage: StoragePort, record: UploadMetadataRecord): StoredUploadFile {
	return {
		url: storage.getPublicUrl(record.storageKey),
		storedName: record.storageKey.split('/').pop() ?? record.storageKey,
		originalName: record.originalName,
		contentType: record.contentType,
		size: record.size,
		lastModified: record.lastModified,
		uploadedAt: record.uploadedAt,
		hash: record.hash
	};
}

async function sha256Hex(body: Uint8Array): Promise<string> {
	const digestInput = new Uint8Array(body.byteLength);
	digestInput.set(body);
	const digest = await crypto.subtle.digest('SHA-256', digestInput);
	return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
		''
	);
}

async function decodePreviewContent(
	record: UploadMetadataRecord,
	body: Uint8Array
): Promise<string | null> {
	const fileName = record.originalName || record.storageKey;
	const contentType = record.contentType || guessContentType(fileName);

	if (supportsTextDecoding(fileName, contentType)) {
		const decoded = new TextDecoder().decode(body);
		return clampPreview(normalizeLineEndings(decoded));
	}

	const ext = getFileExtension(fileName);
	const shouldParseOffice =
		ext === 'docx' ||
		ext === 'xlsx' ||
		contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
		contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
	if (shouldParseOffice) {
		const parsed = await parseAttachmentText({
			buffer: Buffer.from(body),
			filename: fileName,
			contentType
		});
		return typeof parsed === 'string' && parsed.length > 0 ? clampPreview(parsed) : null;
	}

	return null;
}

export function createFileService(storage: StoragePort) {
	return {
		parseUploadUrl(url: string): string | null {
			const key = storage.parseObjectKey(url);
			if (!key || !isSafeStorageKey(key)) return null;
			return key;
		},
		async saveUpload({ file, scope }: SaveUploadInput): Promise<SaveUploadResult> {
			const arrayBuffer = await file.arrayBuffer();
			const body = new Uint8Array(arrayBuffer);
			const hash = await sha256Hex(body);
			const extension = file.name.split('.').pop();
			const storageKey = `uploads/${hash}${extension ? `.${extension}` : ''}`;
			const exists = await storage.hasObject(storageKey);
			if (!exists) {
				await storage.putObject({
					key: storageKey,
					body,
					contentType: file.type
				});
			}

			let content: string | undefined;
			const lowerName = file.name.toLowerCase();
			const isText =
				file.type.startsWith('text/') ||
				file.type === 'application/json' ||
				file.type === 'application/javascript' ||
				file.type === 'application/x-javascript' ||
				[
					'.md',
					'.py',
					'.txt',
					'.json',
					'.js',
					'.ts',
					'.tsx',
					'.jsx',
					'.css',
					'.html',
					'.htm',
					'.yaml',
					'.yml',
					'.toml',
					'.conf',
					'.ini',
					'.sh',
					'.bat',
					'.sql'
				].some((ext) => lowerName.endsWith(ext));
			const isDocx =
				lowerName.endsWith('.docx') ||
				file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
			const isXlsx =
				lowerName.endsWith('.xlsx') ||
				file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

			if (isText) {
				content = new TextDecoder().decode(body);
			} else if (isDocx || isXlsx) {
				content = await parseAttachmentText({
					buffer: Buffer.from(body),
					filename: file.name,
					contentType: file.type
				});
			}

			await upsertUploadMetadataRecord(
				applyUploadOwnership(
					{
						storageKey,
						originalName: file.name,
						contentType: file.type || guessContentType(file.name),
						size: file.size,
						lastModified: file.lastModified,
						uploadedAt: Date.now(),
						hash
					},
					scope
				)
			);

			return {
				url: storage.getPublicUrl(storageKey),
				pathname: file.name,
				contentType: file.type,
				content,
				size: file.size,
				hash,
				lastModified: file.lastModified
			};
		},
		async listUploads(scope: UploadAccessScope): Promise<StoredUploadFile[]> {
			const records = await listUploadMetadata(scope);
			return records.map((record) => toStoredUploadFile(storage, record));
		},
		async renameUpload(url: string, originalName: string, scope: UploadAccessScope): Promise<void> {
			const storageKey = storage.parseObjectKey(url);
			if (!storageKey) {
				throw new UploadForbiddenError();
			}

			const renamed = await renameUploadMetadataRecord(storageKey, originalName, scope);
			if (!renamed) {
				throw new UploadForbiddenError();
			}
		},
		async removeUpload(url: string, scope: UploadAccessScope): Promise<void> {
			const storageKey = storage.parseObjectKey(url);
			if (!storageKey) {
				throw new UploadForbiddenError();
			}

			const metadata = await getUploadMetadataByKey(storageKey);
			if (!metadata || !matchesUploadOwnership(metadata, scope)) {
				throw new UploadForbiddenError();
			}

			await storage.deleteObject(storageKey);
			await removeUploadMetadataRecord(storageKey, scope);
		},
		async assertUploadAccess(url: string, scope: UploadAccessScope): Promise<string> {
			const storageKey = storage.parseObjectKey(url);
			if (!storageKey) {
				throw new UploadForbiddenError();
			}

			const metadata = await getUploadMetadataByKey(storageKey);
			if (!metadata || !matchesUploadOwnership(metadata, scope)) {
				throw new UploadForbiddenError();
			}

			return storageKey;
		},
		async getUploadPreview(
			url: string,
			scope: UploadAccessScope
		): Promise<{ content: string | null; contentType: string }> {
			const storageKey = await getUploadAccess(url, scope);
			const metadata = await getUploadMetadataByKey(storageKey);
			if (!metadata) {
				throw new UploadForbiddenError();
			}

			const object = await storage.getObject(storageKey);
			if (!object) {
				throw new UploadNotFoundError();
			}

			return {
				content: await decodePreviewContent(metadata, object.body),
				contentType: metadata.contentType
			};
		},
		async getObjectDataUrl(url: string): Promise<string | null> {
			const storageKey = storage.parseObjectKey(url);
			if (!storageKey) {
				return null;
			}

			const metadata = await getUploadMetadataByKey(storageKey);
			const object = await storage.getObject(storageKey);
			if (!metadata || !object) {
				return null;
			}

			return `data:${metadata.contentType};base64,${Buffer.from(object.body).toString('base64')}`;
		}
	};

	async function getUploadAccess(url: string, scope: UploadAccessScope): Promise<string> {
		const storageKey = storage.parseObjectKey(url);
		if (!storageKey) {
			throw new UploadForbiddenError();
		}

		const metadata = await getUploadMetadataByKey(storageKey);
		if (!metadata || !matchesUploadOwnership(metadata, scope)) {
			throw new UploadForbiddenError();
		}

		return storageKey;
	}
}

export type FileService = ReturnType<typeof createFileService>;
