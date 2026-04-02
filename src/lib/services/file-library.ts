import type { StoredUploadFile } from '$lib/services/files-api';
import { isOfficeDocument, isTextLikeContentType } from '$lib/utils/files';

export type ManagedFile = StoredUploadFile & {
	previewContent?: string | null;
	previewLoading?: boolean;
};

export type FileTypeFilter = 'text' | 'image' | 'office';
export type SortMode = 'size' | 'name' | 'created';

export function toManagedFile(
	file: StoredUploadFile,
	previous?: ManagedFile | undefined
): ManagedFile {
	return {
		...file,
		previewContent: previous?.previewContent,
		previewLoading: previous?.previewLoading ?? false
	};
}

export function normalizeManagedFiles(
	rawFiles: ReadonlyArray<StoredUploadFile>,
	previousFiles: ReadonlyArray<ManagedFile> = []
): ManagedFile[] {
	const previousByUrl = new Map(previousFiles.map((file) => [file.url, file] as const));
	return rawFiles.map((file) => toManagedFile(file, previousByUrl.get(file.url)));
}

export function mergeManagedFiles(
	existingFiles: ReadonlyArray<ManagedFile>,
	incomingFiles: ReadonlyArray<ManagedFile>
): ManagedFile[] {
	const nextFiles = [...existingFiles];
	const prependedFiles: ManagedFile[] = [];
	const indexByUrl = new Map(nextFiles.map((file, index) => [file.url, index] as const));

	for (const file of incomingFiles) {
		const existingIndex = indexByUrl.get(file.url);
		if (existingIndex === undefined) {
			prependedFiles.push(file);
			continue;
		}

		nextFiles[existingIndex] = {
			...nextFiles[existingIndex],
			...file
		};
	}

	return [...prependedFiles.reverse(), ...nextFiles];
}

export function patchManagedFile(
	files: ReadonlyArray<ManagedFile>,
	url: string,
	patch: Partial<ManagedFile>
): ManagedFile[] {
	return files.map((file) => (file.url === url ? { ...file, ...patch } : file));
}

export function removeManagedFile(files: ReadonlyArray<ManagedFile>, url: string): ManagedFile[] {
	return files.filter((file) => file.url !== url);
}

export function renameManagedFile(
	files: ReadonlyArray<ManagedFile>,
	url: string,
	originalName: string
): ManagedFile[] {
	return patchManagedFile(files, url, { originalName });
}

export function matchesManagedFileFilter(
	file: ManagedFile,
	filter: FileTypeFilter | null
): boolean {
	if (filter === null) return true;
	if (filter === 'text') {
		return isTextLikeContentType(file.contentType);
	}
	if (filter === 'image') {
		return file.contentType.startsWith('image/');
	}
	return isOfficeDocument(file.originalName || file.storedName, file.contentType);
}

function compareManagedFiles(sortMode: SortMode) {
	if (sortMode === 'size') {
		return (a: ManagedFile, b: ManagedFile) => b.size - a.size;
	}
	if (sortMode === 'created') {
		return (a: ManagedFile, b: ManagedFile) => b.uploadedAt - a.uploadedAt;
	}
	return (a: ManagedFile, b: ManagedFile) =>
		a.originalName.localeCompare(b.originalName, undefined, { sensitivity: 'base' });
}

export function getVisibleManagedFiles(
	files: ReadonlyArray<ManagedFile>,
	filter: FileTypeFilter | null,
	sortMode: SortMode
): ManagedFile[] {
	return files
		.filter((file) => matchesManagedFileFilter(file, filter))
		.sort(compareManagedFiles(sortMode));
}
