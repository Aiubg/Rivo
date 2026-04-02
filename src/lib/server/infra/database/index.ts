import type { ServerConfig } from '$lib/server/ports/config';
import type { DatabasePort } from '$lib/server/ports/database';
import { createLocalLibsqlDatabase } from '$lib/server/infra/database/libsql-local';
import { createRemoteLibsqlDatabase } from '$lib/server/infra/database/libsql-remote';

export function createDatabasePort(config: ServerConfig): DatabasePort {
	if (config.database.driver === 'libsql-local') {
		return createLocalLibsqlDatabase(config.database.url, config.database.authToken);
	}

	return createRemoteLibsqlDatabase(config.database.url, config.database.authToken);
}
