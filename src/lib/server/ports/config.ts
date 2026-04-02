export type DeployTarget = 'local' | 'vercel' | 'cloudflare';

export type BuildTarget = DeployTarget;

export type DatabaseDriverKind = 'libsql-local' | 'libsql-remote';

export type StorageDriverKind = 'local-fs' | 's3';

export type ServerConfig = {
	buildTarget: BuildTarget;
	deployTarget: DeployTarget;
	database: {
		driver: DatabaseDriverKind;
		url: string;
		authToken?: string;
	};
	storage: {
		driver: StorageDriverKind;
		localPublicPath: string;
		localStorageRoot: string;
		s3?: {
			bucket: string;
			region: string;
			endpoint?: string;
			publicBaseUrl: string;
			accessKeyId: string;
			secretAccessKey: string;
		};
	};
};
