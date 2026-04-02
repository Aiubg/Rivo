import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleServerError } from '$lib/server/utils';
import { getServerContainer } from '$lib/server/composition/server-container';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES: Record<string, string> = {
	'image/png': '.png',
	'image/jpeg': '.jpg',
	'image/webp': '.webp'
};

export const POST: RequestHandler = async ({ request, locals: { user } }) => {
	if (!user) {
		throw error(401, 'common.unauthorized');
	}

	try {
		const formData = await request.formData();
		const file = formData.get('file') as File | null;
		if (!file) {
			throw error(400, 'upload.no_file_uploaded');
		}
		if (file.size > MAX_AVATAR_SIZE) {
			throw error(400, 'profile.avatar_too_large');
		}

		const extension = ALLOWED_MIME_TYPES[file.type];
		if (!extension) {
			throw error(400, 'profile.avatar_type_not_allowed');
		}

		const arrayBuffer = await file.arrayBuffer();
		const avatarUrl = await getServerContainer().services.profile.uploadAvatar({
			userId: user.id,
			body: new Uint8Array(arrayBuffer),
			contentType: file.type,
			extension
		});

		return json({
			avatarUrl
		});
	} catch (e) {
		handleServerError(e, 'upload.failed', { userId: user.id });
	}
};
