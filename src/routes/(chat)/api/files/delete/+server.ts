import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleServerError, parseJsonBody } from '$lib/server/utils';
import { allowAnonymousChats } from '$lib/utils/constants';
import { DeleteFileSchema } from '$lib/utils/zod';
import { parseUploadUrl } from '$lib/server/files/upload-store';
import { UploadForbiddenError } from '$lib/server/errors/upload';
import { getUploadAccessScope } from '$lib/server/uploads/access';
import { getServerContainer } from '$lib/server/composition/server-container';

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const { user } = locals;
	if (!user && !allowAnonymousChats) {
		throw error(401, 'common.unauthorized');
	}

	try {
		const parsed = await parseJsonBody(request, DeleteFileSchema);
		if (parsed instanceof Response) {
			return parsed;
		}
		const { url } = parsed;

		if (!parseUploadUrl(url)) {
			throw error(403, 'common.forbidden');
		}
		await getServerContainer().services.files.removeUpload(url, getUploadAccessScope(locals));

		return json({ success: true });
	} catch (e) {
		if (e instanceof UploadForbiddenError) {
			throw error(403, 'common.forbidden');
		}
		handleServerError(e, 'upload.delete_failed');
	}
};
