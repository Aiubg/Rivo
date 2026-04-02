import { loadServerConfig } from '$lib/server/infra/config/env';
import { createStoragePort } from '$lib/server/infra/storage';
import { createFileService } from '$lib/server/app/files/service';
import { createProfileService } from '$lib/server/app/profile/service';

let cachedContainer: ReturnType<typeof createServerContainer> | null = null;
let cachedSignature: string | null = null;

function createServerContainer() {
	const config = loadServerConfig();
	const storage = createStoragePort(config);
	const files = createFileService(storage);
	const profile = createProfileService(storage);

	return {
		config,
		storage,
		services: {
			files,
			profile
		}
	};
}

export function getServerContainer() {
	const signature = JSON.stringify({
		cwd: process.cwd(),
		env: {
			deployTarget: process.env.DEPLOY_TARGET,
			storageDriver: process.env.STORAGE_DRIVER,
			localRoot: process.env.LOCAL_UPLOAD_STORAGE_ROOT,
			localPublicPath: process.env.LOCAL_UPLOAD_PUBLIC_PATH,
			s3Bucket: process.env.S3_BUCKET,
			s3Endpoint: process.env.S3_ENDPOINT,
			assetBaseUrl: process.env.ASSET_PUBLIC_BASE_URL
		}
	});

	if (!cachedContainer || cachedSignature !== signature) {
		cachedContainer = createServerContainer();
		cachedSignature = signature;
	}

	return cachedContainer;
}
