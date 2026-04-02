import { env } from '$env/dynamic/private';
import type {
	BuildTarget,
	DatabaseDriverKind,
	DeployTarget,
	ServerConfig,
	StorageDriverKind
} from '$lib/server/ports/config';

const DEPLOY_TARGETS = new Set<DeployTarget>(['local', 'vercel', 'cloudflare']);
const DATABASE_DRIVERS = new Set<DatabaseDriverKind>(['libsql-local', 'libsql-remote']);
const STORAGE_DRIVERS = new Set<StorageDriverKind>(['local-fs', 's3']);

function readString(name: string): string | undefined {
	const value = env[name];
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeDeployTarget(value: string | undefined, fallback: DeployTarget): DeployTarget {
	if (value && DEPLOY_TARGETS.has(value as DeployTarget)) {
		return value as DeployTarget;
	}
	return fallback;
}

function normalizeDatabaseDriver(
	value: string | undefined,
	url: string | undefined
): DatabaseDriverKind {
	if (value && DATABASE_DRIVERS.has(value as DatabaseDriverKind)) {
		return value as DatabaseDriverKind;
	}
	return (url ?? '').trim().startsWith('file:') ? 'libsql-local' : 'libsql-remote';
}

function normalizeStorageDriver(
	value: string | undefined,
	deployTarget: DeployTarget
): StorageDriverKind {
	if (value && STORAGE_DRIVERS.has(value as StorageDriverKind)) {
		return value as StorageDriverKind;
	}
	return deployTarget === 'local' ? 'local-fs' : 's3';
}

export function loadServerConfig(): ServerConfig {
	const buildTarget = normalizeDeployTarget(
		readString('BUILD_TARGET'),
		(readString('VERCEL')
			? 'vercel'
			: readString('CF_PAGES')
				? 'cloudflare'
				: 'local') as BuildTarget
	);
	const deployTarget = normalizeDeployTarget(readString('DEPLOY_TARGET'), buildTarget);
	const libsqlUrl = readString('LIBSQL_URL') ?? 'file:./data/app.db';
	const databaseDriver = normalizeDatabaseDriver(readString('DB_DRIVER'), libsqlUrl);
	const storageDriver = normalizeStorageDriver(readString('STORAGE_DRIVER'), deployTarget);

	const config: ServerConfig = {
		buildTarget,
		deployTarget,
		database: {
			driver: databaseDriver,
			url: libsqlUrl,
			authToken: readString('LIBSQL_AUTH_TOKEN')
		},
		storage: {
			driver: storageDriver,
			localPublicPath: readString('LOCAL_UPLOAD_PUBLIC_PATH') ?? '/uploads',
			localStorageRoot: readString('LOCAL_UPLOAD_STORAGE_ROOT') ?? 'static/uploads'
		}
	};

	if (storageDriver === 's3') {
		const bucket = readString('S3_BUCKET');
		const region = readString('S3_REGION') ?? 'auto';
		const publicBaseUrl = readString('ASSET_PUBLIC_BASE_URL');
		const accessKeyId = readString('S3_ACCESS_KEY_ID');
		const secretAccessKey = readString('S3_SECRET_ACCESS_KEY');

		if (!bucket || !publicBaseUrl || !accessKeyId || !secretAccessKey) {
			throw new Error(
				'S3 storage requires S3_BUCKET, ASSET_PUBLIC_BASE_URL, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY'
			);
		}

		config.storage.s3 = {
			bucket,
			region,
			endpoint: readString('S3_ENDPOINT'),
			publicBaseUrl,
			accessKeyId,
			secretAccessKey
		};
	}

	return config;
}
