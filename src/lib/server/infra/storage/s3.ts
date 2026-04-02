import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client
} from '@aws-sdk/client-s3';
import type { StorageObject, StoragePort, StoragePutInput } from '$lib/server/ports/storage';

function trimSlashes(value: string): string {
	return value.replace(/^\/+|\/+$/g, '');
}

async function toUint8Array(body: unknown): Promise<Uint8Array> {
	if (body && typeof body === 'object') {
		if ('transformToByteArray' in body && typeof body.transformToByteArray === 'function') {
			return await (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
		}
		if ('arrayBuffer' in body && typeof body.arrayBuffer === 'function') {
			const buffer = await (body as { arrayBuffer(): Promise<ArrayBuffer> }).arrayBuffer();
			return new Uint8Array(buffer);
		}
	}

	throw new Error('Unsupported S3 body type');
}

export function createS3Storage(options: {
	bucket: string;
	region: string;
	endpoint?: string;
	publicBaseUrl: string;
	accessKeyId: string;
	secretAccessKey: string;
}): StoragePort {
	const client = new S3Client({
		region: options.region,
		endpoint: options.endpoint,
		forcePathStyle: Boolean(options.endpoint),
		credentials: {
			accessKeyId: options.accessKeyId,
			secretAccessKey: options.secretAccessKey
		}
	});
	const publicBaseUrl = options.publicBaseUrl.replace(/\/+$/, '');

	return {
		async putObject(input: StoragePutInput): Promise<void> {
			await client.send(
				new PutObjectCommand({
					Bucket: options.bucket,
					Key: input.key,
					Body: input.body,
					ContentType: input.contentType
				})
			);
		},
		async getObject(key: string): Promise<StorageObject | null> {
			try {
				const result = await client.send(
					new GetObjectCommand({
						Bucket: options.bucket,
						Key: key
					})
				);

				if (!result.Body) {
					return null;
				}

				return {
					key,
					body: await toUint8Array(result.Body),
					contentType: result.ContentType,
					contentLength: result.ContentLength,
					lastModified: result.LastModified?.getTime()
				};
			} catch (error) {
				if (typeof error === 'object' && error && 'name' in error && error.name === 'NoSuchKey') {
					return null;
				}
				throw error;
			}
		},
		async deleteObject(key: string): Promise<void> {
			await client.send(
				new DeleteObjectCommand({
					Bucket: options.bucket,
					Key: key
				})
			);
		},
		async hasObject(key: string): Promise<boolean> {
			try {
				await client.send(
					new HeadObjectCommand({
						Bucket: options.bucket,
						Key: key
					})
				);
				return true;
			} catch {
				return false;
			}
		},
		getPublicUrl(key: string): string {
			return `${publicBaseUrl}/${trimSlashes(key)}`;
		},
		parseObjectKey(url: string): string | null {
			try {
				const parsed = new URL(url, publicBaseUrl);
				const base = new URL(publicBaseUrl);
				if (parsed.origin !== base.origin) {
					return null;
				}
				const basePath = trimSlashes(base.pathname);
				const objectPath = trimSlashes(parsed.pathname);
				if (basePath && !objectPath.startsWith(`${basePath}/`)) {
					return null;
				}
				return basePath ? objectPath.slice(basePath.length + 1) : objectPath;
			} catch {
				return null;
			}
		}
	};
}
