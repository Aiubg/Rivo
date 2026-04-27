export const MAX_UPLOAD_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_AVATAR_FILE_SIZE = 2 * 1024 * 1024;

export const UPLOAD_TEXT_EXTENSIONS = [
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
] as const;

export const UPLOAD_OFFICE_EXTENSIONS = ['.docx', '.xlsx'] as const;
export const UPLOAD_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'] as const;

export const ALLOWED_UPLOAD_MIME_TYPES = [
	'text/plain',
	'text/markdown',
	'text/css',
	'text/html',
	'text/javascript',
	'text/x-python',
	'text/x-python-script',
	'application/json',
	'application/x-javascript',
	'application/javascript',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
	'image/bmp'
] as const;

export const ALLOWED_AVATAR_MIME_EXTENSIONS = {
	'image/png': '.png',
	'image/jpeg': '.jpg',
	'image/webp': '.webp'
} as const;

export const BASE_UPLOAD_INPUT_ACCEPT = [
	'text/*',
	'application/json',
	'application/javascript',
	...UPLOAD_TEXT_EXTENSIONS,
	...UPLOAD_OFFICE_EXTENSIONS
].join(',');

export const IMAGE_UPLOAD_INPUT_ACCEPT = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
	'image/bmp',
	...UPLOAD_IMAGE_EXTENSIONS
].join(',');

export const UPLOAD_INPUT_ACCEPT = `${BASE_UPLOAD_INPUT_ACCEPT},${IMAGE_UPLOAD_INPUT_ACCEPT}`;
export const AVATAR_INPUT_ACCEPT = Object.keys(ALLOWED_AVATAR_MIME_EXTENSIONS).join(',');

export function isAllowedUploadFile(file: Pick<File, 'name' | 'type'>): boolean {
	const mime = file.type.toLowerCase();
	const lowerName = file.name.toLowerCase();
	const isAllowedMime = (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(mime);
	const isAllowedExt = [
		...UPLOAD_TEXT_EXTENSIONS,
		...UPLOAD_OFFICE_EXTENSIONS,
		...UPLOAD_IMAGE_EXTENSIONS
	].some((extension) => lowerName.endsWith(extension));

	return isAllowedMime || isAllowedExt;
}

export function isUploadImageFile(file: Pick<File, 'name' | 'type'>): boolean {
	const mime = file.type.toLowerCase();
	const lowerName = file.name.toLowerCase();
	return (
		((ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(mime) &&
			mime.startsWith('image/')) ||
		UPLOAD_IMAGE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
	);
}
