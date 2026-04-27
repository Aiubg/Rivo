import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleServerError } from '$lib/server/utils';
import { getServerContainer } from '$lib/server/composition/server-container';
import {
	ALLOWED_AVATAR_MIME_EXTENSIONS,
	MAX_AVATAR_FILE_SIZE
} from '$lib/utils/upload-constraints';

export const POST: RequestHandler = async ({ request, locals: { user } }) => {
	if (!user) {
		throw error(401, 'common.unauthorized');
	}

	try {
		const formData = await request.formData();
		const fileEntry = formData.get('file');
		if (!(fileEntry instanceof File)) {
			throw error(400, 'upload.no_file_uploaded');
		}
		const file = fileEntry;
		if (file.size > MAX_AVATAR_FILE_SIZE) {
			throw error(400, 'profile.avatar_too_large');
		}

		const contentType = file.type.toLowerCase();
		const extension =
			ALLOWED_AVATAR_MIME_EXTENSIONS[contentType as keyof typeof ALLOWED_AVATAR_MIME_EXTENSIONS];
		if (!extension) {
			throw error(400, 'profile.avatar_type_not_allowed');
		}

		const arrayBuffer = await file.arrayBuffer();
		const avatarUrl = await getServerContainer().services.profile.uploadAvatar({
			userId: user.id,
			body: new Uint8Array(arrayBuffer),
			contentType,
			extension
		});

		return json({
			avatarUrl
		});
	} catch (e) {
		handleServerError(e, 'upload.failed', { userId: user.id });
	}
};
