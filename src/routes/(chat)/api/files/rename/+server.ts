import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { allowAnonymousChats } from '$lib/utils/constants';
import { handleServerError, parseJsonBody } from '$lib/server/utils';
import { RenameFileSchema } from '$lib/utils/zod';
import { parseUploadUrl, renameUploadMetadata } from '$lib/server/files/upload-store';
import { UploadForbiddenError } from '$lib/server/errors/upload';
import { getUploadAccessScope } from '$lib/server/uploads/access';

export const PATCH: RequestHandler = async ({ request, locals }) => {
	const { user } = locals;
	if (!user && !allowAnonymousChats) {
		throw error(401, 'common.unauthorized');
	}

	try {
		const parsed = await parseJsonBody(request, RenameFileSchema);
		if (parsed instanceof Response) {
			return parsed;
		}
		const { url, name } = parsed;

		if (!parseUploadUrl(url)) {
			throw error(403, 'common.forbidden');
		}

		await renameUploadMetadata(url, name, getUploadAccessScope(locals));
		return json({ success: true });
	} catch (e) {
		if (e instanceof UploadForbiddenError) {
			throw error(403, 'common.forbidden');
		}
		handleServerError(e, 'upload.failed');
	}
};
