const TEXT_EXTENSIONS = new Set([
	'md',
	'py',
	'txt',
	'json',
	'js',
	'ts',
	'tsx',
	'jsx',
	'css',
	'html',
	'htm',
	'yaml',
	'yml',
	'toml',
	'conf',
	'ini',
	'sh',
	'bat',
	'sql'
]);

const TEXT_PREVIEW_CONTENT_TYPES = new Set(['application/json', 'application/javascript']);

const OFFICE_DOCUMENT_CONTENT_TYPES = new Set([
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const MIME_BY_EXTENSION: Record<string, string> = {
	txt: 'text/plain',
	md: 'text/markdown',
	css: 'text/css',
	html: 'text/html',
	htm: 'text/html',
	js: 'application/javascript',
	mjs: 'application/javascript',
	cjs: 'application/javascript',
	json: 'application/json',
	py: 'text/x-python',
	ts: 'text/plain',
	tsx: 'text/plain',
	jsx: 'text/plain',
	yaml: 'text/plain',
	yml: 'text/plain',
	toml: 'text/plain',
	conf: 'text/plain',
	ini: 'text/plain',
	sh: 'text/plain',
	bat: 'text/plain',
	sql: 'text/plain',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

export function getStoredUploadName(url: string): string {
	if (!url.startsWith('/uploads/')) return url;
	return url.slice('/uploads/'.length);
}

export function getFileExtension(fileName: string): string {
	const idx = fileName.lastIndexOf('.');
	return idx === -1 ? '' : fileName.slice(idx + 1).toLowerCase();
}

export function splitFileName(fileName: string): { baseName: string; extension: string } {
	const idx = fileName.lastIndexOf('.');
	if (idx <= 0 || idx === fileName.length - 1) {
		return { baseName: fileName, extension: '' };
	}

	return {
		baseName: fileName.slice(0, idx),
		extension: fileName.slice(idx)
	};
}

export function isTextLikeContentType(contentType: string): boolean {
	return contentType.startsWith('text/') || TEXT_PREVIEW_CONTENT_TYPES.has(contentType);
}

export function isOfficeDocument(fileName: string, contentType: string): boolean {
	const extension = getFileExtension(fileName);
	return (
		extension === 'docx' || extension === 'xlsx' || OFFICE_DOCUMENT_CONTENT_TYPES.has(contentType)
	);
}

export function supportsTextDecoding(fileName: string, contentType: string): boolean {
	return isTextLikeContentType(contentType) || TEXT_EXTENSIONS.has(getFileExtension(fileName));
}

export function supportsTextPreview(fileName: string, contentType: string): boolean {
	return supportsTextDecoding(fileName, contentType) || isOfficeDocument(fileName, contentType);
}

export function guessContentType(fileName: string): string {
	return MIME_BY_EXTENSION[getFileExtension(fileName)] ?? 'application/octet-stream';
}

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
