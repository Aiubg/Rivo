import type { StoragePort } from '$lib/server/ports/storage';

export function createProfileService(storage: StoragePort) {
	return {
		async uploadAvatar(input: {
			userId: string;
			body: Uint8Array;
			contentType: string;
			extension: string;
		}): Promise<string> {
			const key = `avatars/${input.userId}-${crypto.randomUUID()}${input.extension}`;
			await storage.putObject({
				key,
				body: input.body,
				contentType: input.contentType
			});
			return storage.getPublicUrl(key);
		}
	};
}

export type ProfileService = ReturnType<typeof createProfileService>;
