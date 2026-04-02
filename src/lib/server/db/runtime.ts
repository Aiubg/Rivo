import { logger } from '$lib/utils/logger';
import type { drizzle } from 'drizzle-orm/libsql';
import { sql, eq as rawEq } from 'drizzle-orm';
import { DbInternalError } from '$lib/server/errors/db';
import { message } from '$lib/server/db/schema';
import { extractSearchTextFromParts } from '$lib/utils/chat';
import { loadServerConfig } from '$lib/server/infra/config/env';
import { createDatabasePort } from '$lib/server/infra/database';
import type { DatabasePort } from '$lib/server/ports/database';

let cachedDatabasePort: DatabasePort | null = null;
let cachedDatabaseSignature: string | null = null;

function getDatabaseSignature() {
	const config = loadServerConfig();
	return {
		config,
		signature: JSON.stringify({
			cwd: process.cwd(),
			driver: config.database.driver,
			url: config.database.url,
			authToken: config.database.authToken
		})
	};
}

function getDb() {
	const { config, signature } = getDatabaseSignature();
	if (cachedDatabasePort && cachedDatabaseSignature === signature) return cachedDatabasePort.db;

	try {
		if (cachedDatabaseSignature !== signature) {
			void cachedDatabasePort?.dispose?.();
			messageSearchTextSetupPromise = null;
			storedUploadTableSetupPromise = null;
		}
		cachedDatabasePort = createDatabasePort(config);
		cachedDatabaseSignature = signature;
		return cachedDatabasePort.db;
	} catch (error) {
		throw new DbInternalError({ cause: error });
	}
}

function getDatabasePort(): DatabasePort {
	if (cachedDatabasePort) return cachedDatabasePort;
	getDb();
	if (!cachedDatabasePort) {
		throw new DbInternalError({ cause: new Error('Failed to initialize database port') });
	}
	return cachedDatabasePort;
}

export async function runSerializedWrite<T>(operation: () => Promise<T>): Promise<T> {
	return getDatabasePort().runSerializedWrite(operation);
}

export async function disposeDatabasePort(): Promise<void> {
	await cachedDatabasePort?.dispose?.();
	cachedDatabasePort = null;
	cachedDatabaseSignature = null;
	messageSearchTextSetupPromise = null;
	storedUploadTableSetupPromise = null;
}

export const db = new Proxy({} as unknown as ReturnType<typeof drizzle>, {
	get(_target, prop) {
		return (getDb() as unknown as Record<PropertyKey, unknown>)[prop] as never;
	}
});

export function eq(left: unknown, right: unknown) {
	return rawEq(left as never, right as never);
}

function flattenErrorMessages(error: unknown, seen = new Set<unknown>()): string {
	if (!error || seen.has(error)) {
		return '';
	}
	seen.add(error);

	if (typeof error === 'string') {
		return error;
	}

	if (error instanceof Error) {
		const nested =
			'cause' in error
				? flattenErrorMessages((error as Error & { cause?: unknown }).cause, seen)
				: '';
		return `${error.message} ${nested}`.trim();
	}

	if (typeof error === 'object') {
		const record = error as Record<string, unknown>;
		const message = typeof record.message === 'string' ? record.message : '';
		const nested = 'cause' in record ? flattenErrorMessages(record.cause, seen) : '';
		return `${message} ${nested}`.trim();
	}

	return '';
}

export function isMissingUnreadColumnError(error: unknown): boolean {
	const messageText = flattenErrorMessages(error);
	return (
		messageText.toLowerCase().includes('no such column') &&
		messageText.toLowerCase().includes('unread')
	);
}

function isMissingSearchTextColumnError(error: unknown): boolean {
	const messageText = flattenErrorMessages(error);
	return (
		messageText.toLowerCase().includes('no such column') &&
		messageText.toLowerCase().includes('searchtext')
	);
}

function isDuplicateSearchTextColumnError(error: unknown): boolean {
	const messageText = flattenErrorMessages(error);
	return (
		messageText.toLowerCase().includes('duplicate column name') &&
		messageText.toLowerCase().includes('searchtext')
	);
}

let messageSearchTextSetupPromise: Promise<void> | null = null;
let storedUploadTableSetupPromise: Promise<void> | null = null;

async function hasMessageSearchTextColumn(): Promise<boolean> {
	const rows = (await db.all(sql.raw('PRAGMA table_info(`Message`)'))) as Array<{
		name?: unknown;
	}>;

	return rows.some((row) => row?.name === 'searchText');
}

async function backfillMessageSearchText(): Promise<void> {
	const rows = await db
		.select({ id: message.id, parts: message.parts, searchText: message.searchText })
		.from(message);
	const rowsToBackfill = rows.filter(
		(row: (typeof rows)[number]) => !row.searchText || row.searchText.trim() === ''
	);
	if (rowsToBackfill.length === 0) {
		return;
	}

	for (const row of rowsToBackfill) {
		await db
			.update(message)
			.set({ searchText: extractSearchTextFromParts(row.parts) })
			.where(eq(message.id, row.id));
	}
}

export async function ensureMessageSearchTextColumn(): Promise<void> {
	const { signature } = getDatabaseSignature();
	if (cachedDatabaseSignature !== signature) {
		messageSearchTextSetupPromise = null;
	}
	if (messageSearchTextSetupPromise) {
		return messageSearchTextSetupPromise;
	}

	messageSearchTextSetupPromise = runSerializedWrite(async () => {
		const hasColumn = await hasMessageSearchTextColumn();
		if (!hasColumn) {
			try {
				await db.run(
					sql.raw("ALTER TABLE `Message` ADD COLUMN `searchText` text NOT NULL DEFAULT '';")
				);
			} catch (error) {
				if (!isDuplicateSearchTextColumnError(error)) {
					throw error;
				}
			}
		}

		try {
			await backfillMessageSearchText();
		} catch (error) {
			if (!isMissingSearchTextColumnError(error)) {
				throw error;
			}
		}
	}).catch((error) => {
		messageSearchTextSetupPromise = null;
		throw error;
	});

	return messageSearchTextSetupPromise;
}

export async function ensureStoredUploadTable(): Promise<void> {
	const { signature } = getDatabaseSignature();
	if (cachedDatabaseSignature !== signature) {
		storedUploadTableSetupPromise = null;
	}
	if (storedUploadTableSetupPromise) {
		return storedUploadTableSetupPromise;
	}

	storedUploadTableSetupPromise = runSerializedWrite(async () => {
		await db.run(
			sql.raw(`
			CREATE TABLE IF NOT EXISTS \`StoredUpload\` (
				\`storageKey\` text PRIMARY KEY NOT NULL,
				\`originalName\` text NOT NULL,
				\`contentType\` text NOT NULL,
				\`size\` integer NOT NULL,
				\`lastModified\` integer NOT NULL,
				\`uploadedAt\` integer NOT NULL,
				\`hash\` text,
				\`userId\` text,
				\`anonymousSessionId\` text
			);
		`)
		);
	}).catch((error) => {
		storedUploadTableSetupPromise = null;
		throw error;
	});

	return storedUploadTableSetupPromise;
}
