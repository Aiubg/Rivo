import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { allowAnonymousChats } from '$lib/utils/constants';
import { handleServerError } from '$lib/server/utils';
import { getUploadAccessScope } from '$lib/server/uploads/access';
import { getServerContainer } from '$lib/server/composition/server-container';

const ALLOWED_MIME_TYPES = [
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
];

const TEXT_EXTENSIONS = [
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
];
const DOCX_EXTENSIONS = ['.docx'];
const XLSX_EXTENSIONS = ['.xlsx'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = locals;
	if (!user && !allowAnonymousChats) {
		throw error(401, 'common.unauthorized');
	}

	try {
		const formData = await request.formData();
		const file = formData.get('file') as File;

		if (!file) {
			throw error(400, 'upload.no_file_uploaded');
		}

		if (file.size > 1024 * 1024 * 25) {
			throw error(400, 'upload.file_size_too_large');
		}

		const isAllowedMime = ALLOWED_MIME_TYPES.includes(file.type);
		const lowerName = file.name.toLowerCase();
		const isTextExt = TEXT_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
		const isDocxExt = DOCX_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
		const isXlsxExt = XLSX_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
		const isImageExt = IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
		const isAllowedExt = isTextExt || isDocxExt || isXlsxExt || isImageExt;

		if (!isAllowedMime && !isAllowedExt) {
			throw error(400, 'upload.file_type_not_allowed');
		}

		const result = await getServerContainer().services.files.saveUpload({
			file,
			scope: getUploadAccessScope(locals)
		});

		return json(result);
	} catch (e) {
		handleServerError(e, 'upload.failed');
	}
};
