import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { DatabasePort } from '$lib/server/ports/database';
import { logger } from '$lib/utils/logger';

export function createRemoteLibsqlDatabase(url: string, authToken?: string): DatabasePort {
	const client = createClient({
		url: url.trim(),
		authToken
	});

	void client.execute('PRAGMA foreign_keys=ON').catch((error) => {
		logger.error('Failed to enable foreign keys', error);
	});

	return {
		db: drizzle(client),
		runSerializedWrite<T>(operation: () => Promise<T>): Promise<T> {
			return operation();
		},
		async dispose(): Promise<void> {
			await client.close();
		}
	};
}
