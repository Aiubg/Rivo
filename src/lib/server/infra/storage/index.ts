import type { ServerConfig } from '$lib/server/ports/config';
import type { StoragePort } from '$lib/server/ports/storage';
import { createLocalFileStorage } from '$lib/server/infra/storage/local-fs';
import { createS3Storage } from '$lib/server/infra/storage/s3';

export function createStoragePort(config: ServerConfig): StoragePort {
	if (config.storage.driver === 'local-fs') {
		return createLocalFileStorage({
			storageRoot: config.storage.localStorageRoot,
			publicPath: config.storage.localPublicPath
		});
	}

	if (!config.storage.s3) {
		throw new Error('Missing S3 storage configuration');
	}

	return createS3Storage(config.storage.s3);
}
