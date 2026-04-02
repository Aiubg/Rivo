import type { drizzle } from 'drizzle-orm/libsql';

export type DrizzleDatabase = ReturnType<typeof drizzle>;

export type DatabasePort = {
	db: DrizzleDatabase;
	runSerializedWrite<T>(operation: () => Promise<T>): Promise<T>;
	dispose?(): Promise<void>;
};
