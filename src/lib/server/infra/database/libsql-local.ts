import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type { DatabasePort } from '$lib/server/ports/database';
import { logger } from '$lib/utils/logger';

const SQLITE_BUSY_TIMEOUT_MS = 5000;

function resolveFileUrl(value: string): string {
	const raw = value.trim();
	if (raw.startsWith('file:')) return raw;
	return pathToFileURL(path.resolve(raw)).href;
}

export function createLocalLibsqlDatabase(url: string, authToken?: string): DatabasePort {
	const resolvedUrl = resolveFileUrl(url);
	const dbPath = resolvedUrl.slice(5);
	const dbDir = path.dirname(dbPath);

	if (!existsSync(dbDir)) {
		mkdirSync(dbDir, { recursive: true });
	}

	const client = createClient({
		url: resolvedUrl,
		authToken
	});

	void client.execute('PRAGMA journal_mode=WAL').catch((error) => {
		logger.error('Failed to enable WAL journal mode', error);
	});
	void client.execute(`PRAGMA busy_timeout=${SQLITE_BUSY_TIMEOUT_MS}`).catch((error) => {
		logger.error('Failed to configure SQLite busy timeout', error);
	});
	void client.execute('PRAGMA foreign_keys=ON').catch((error) => {
		logger.error('Failed to enable foreign keys', error);
	});

	let sqliteWriteQueue: Promise<void> = Promise.resolve();

	return {
		db: drizzle(client),
		async runSerializedWrite<T>(operation: () => Promise<T>): Promise<T> {
			let releaseCurrentWrite = () => {};
			const previousWrite = sqliteWriteQueue;
			sqliteWriteQueue = new Promise<void>((resolve) => {
				releaseCurrentWrite = resolve;
			});

			await previousWrite;

			try {
				return await operation();
			} finally {
				releaseCurrentWrite();
			}
		},
		async dispose(): Promise<void> {
			await client.close();
		}
	};
}
