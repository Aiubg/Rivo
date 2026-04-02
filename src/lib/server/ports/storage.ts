export type StoragePutInput = {
	key: string;
	body: Uint8Array;
	contentType?: string;
};

export type StorageObject = {
	key: string;
	body: Uint8Array;
	contentType?: string;
	contentLength?: number;
	lastModified?: number;
};

export interface StoragePort {
	putObject(input: StoragePutInput): Promise<void>;
	getObject(key: string): Promise<StorageObject | null>;
	deleteObject(key: string): Promise<void>;
	hasObject(key: string): Promise<boolean>;
	getPublicUrl(key: string): string;
	parseObjectKey(url: string): string | null;
}
