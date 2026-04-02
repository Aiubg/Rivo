import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { allowAnonymousChats } from '$lib/utils/constants';
import { handleServerError } from '$lib/server/utils';
import { listStoredUploads } from '$lib/server/files/upload-store';
import { getUploadAccessScope } from '$lib/server/uploads/access';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = locals;
	if (!user && !allowAnonymousChats) {
		throw error(401, 'common.unauthorized');
	}

	try {
		const files = await listStoredUploads(getUploadAccessScope(locals));
		return json({ files });
	} catch (e) {
		handleServerError(e, 'upload.failed');
	}
};
