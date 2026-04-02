import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { allowAnonymousChats } from '$lib/utils/constants';
import { listStoredUploads } from '$lib/server/files/upload-store';
import { handleServerError } from '$lib/server/utils';
import { getUploadAccessScope } from '$lib/server/uploads/access';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = locals;
	if (!user && !allowAnonymousChats) {
		throw error(401, 'common.unauthorized');
	}

	try {
		const files = await listStoredUploads(getUploadAccessScope(locals));
		return { files };
	} catch (e) {
		handleServerError(e, 'upload.failed');
	}
};
