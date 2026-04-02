import { access, mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import type { StorageObject, StoragePort, StoragePutInput } from '$lib/server/ports/storage';

function stripLeadingSlash(value: string): string {
	return value.replace(/^\/+/, '');
}

export function createLocalFileStorage(options: {
	storageRoot: string;
	publicPath: string;
}): StoragePort {
	const normalizedPublicPath = `/${stripLeadingSlash(options.publicPath).replace(/\/+$/, '')}`;
	const storageRoot = options.storageRoot;

	function resolveFsPath(key: string): string {
		return path.join(storageRoot, key.replace(/^uploads\//, ''));
	}

	return {
		async putObject(input: StoragePutInput): Promise<void> {
			const fsPath = resolveFsPath(input.key);
			await mkdir(path.dirname(fsPath), { recursive: true });
			await writeFile(fsPath, input.body);
		},
		async getObject(key: string): Promise<StorageObject | null> {
			const fsPath = resolveFsPath(key);
			try {
				const body = await readFile(fsPath);
				return {
					key,
					body,
					lastModified: Date.now()
				};
			} catch (error) {
				if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') {
					return null;
				}
				throw error;
			}
		},
		async deleteObject(key: string): Promise<void> {
			const fsPath = resolveFsPath(key);
			await rm(fsPath, { force: true });
		},
		async hasObject(key: string): Promise<boolean> {
			try {
				await access(resolveFsPath(key));
				return true;
			} catch {
				return false;
			}
		},
		getPublicUrl(key: string): string {
			return `${normalizedPublicPath}/${key.replace(/^uploads\//, '')}`;
		},
		parseObjectKey(url: string): string | null {
			try {
				const pathname = new URL(url, 'http://local.storage').pathname;
				if (!pathname.startsWith(`${normalizedPublicPath}/`)) return null;
				const suffix = pathname.slice(`${normalizedPublicPath}/`.length);
				if (!suffix || suffix.includes('..')) return null;
				return `uploads/${suffix}`;
			} catch {
				return null;
			}
		}
	};
}
