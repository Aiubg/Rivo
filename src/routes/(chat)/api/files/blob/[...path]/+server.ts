import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { allowAnonymousChats } from '$lib/utils/constants';
import { getServerContainer } from '$lib/server/composition/server-container';
import { getUploadAccessScope } from '$lib/server/uploads/access';
import { UploadForbiddenError, UploadNotFoundError } from '$lib/server/errors/upload';
import { handleServerError } from '$lib/server/utils';

function getContentDisposition(fileName: string): string {
	const fallback = fileName.replace(/[^\x20-\x7E]|["\\\r\n]/g, '_') || 'download';
	return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const { user } = locals;
	if (!user && !allowAnonymousChats) {
		throw error(401, 'common.unauthorized');
	}

	try {
		const object = await getServerContainer().services.files.getUploadObject(
			url.pathname,
			getUploadAccessScope(locals)
		);

		return new Response(object.body as BodyInit, {
			headers: {
				'content-type': object.contentType,
				'content-length': String(object.contentLength),
				'cache-control': 'private, max-age=60',
				'content-disposition': getContentDisposition(object.originalName),
				'x-content-type-options': 'nosniff'
			}
		});
	} catch (e) {
		if (e instanceof UploadForbiddenError) {
			throw error(403, 'common.forbidden');
		}
		if (e instanceof UploadNotFoundError) {
			throw error(404, 'common.not_found');
		}
		handleServerError(e, 'upload.failed');
	}
};
