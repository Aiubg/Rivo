import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { allowAnonymousChats } from '$lib/utils/constants';
import { handleServerError } from '$lib/server/utils';
import { getUploadAccessScope } from '$lib/server/uploads/access';
import { getServerContainer } from '$lib/server/composition/server-container';
import { isAllowedUploadFile, MAX_UPLOAD_FILE_SIZE } from '$lib/utils/upload-constraints';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = locals;
	if (!user && !allowAnonymousChats) {
		throw error(401, 'common.unauthorized');
	}

	try {
		const formData = await request.formData();
		const fileEntry = formData.get('file');

		if (!(fileEntry instanceof File)) {
			throw error(400, 'upload.no_file_uploaded');
		}
		const file = fileEntry;

		if (file.size > MAX_UPLOAD_FILE_SIZE) {
			throw error(400, 'upload.file_size_too_large');
		}

		if (!isAllowedUploadFile(file)) {
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
