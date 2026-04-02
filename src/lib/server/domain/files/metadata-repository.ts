import { and, desc, eq, sql } from 'drizzle-orm';
import { storedUpload } from '$lib/server/db/schema';
import { db, ensureStoredUploadTable } from '$lib/server/db/runtime';
import type { UploadAccessScope } from '$lib/server/uploads/access';

export type UploadMetadataRecord = {
	storageKey: string;
	originalName: string;
	contentType: string;
	size: number;
	lastModified: number;
	uploadedAt: number;
	hash?: string;
	userId?: string | null;
	anonymousSessionId?: string | null;
};

function mapRowToRecord(row: typeof storedUpload.$inferSelect): UploadMetadataRecord {
	return {
		...row,
		hash: row.hash ?? undefined,
		userId: row.userId ?? null,
		anonymousSessionId: row.anonymousSessionId ?? null
	};
}

function buildOwnershipWhere(scope: UploadAccessScope) {
	if (scope.type === 'user') {
		return eq(storedUpload.userId, scope.userId);
	}

	if (scope.type === 'anonymous') {
		return eq(storedUpload.anonymousSessionId, scope.anonymousSessionId);
	}

	return sql`1 = 0`;
}

export async function upsertUploadMetadata(record: UploadMetadataRecord): Promise<void> {
	await ensureStoredUploadTable();
	await db
		.insert(storedUpload)
		.values({
			storageKey: record.storageKey,
			originalName: record.originalName,
			contentType: record.contentType,
			size: record.size,
			lastModified: record.lastModified,
			uploadedAt: record.uploadedAt,
			hash: record.hash ?? null,
			userId: record.userId ?? null,
			anonymousSessionId: record.anonymousSessionId ?? null
		})
		.onConflictDoUpdate({
			target: storedUpload.storageKey,
			set: {
				originalName: record.originalName,
				contentType: record.contentType,
				size: record.size,
				lastModified: record.lastModified,
				uploadedAt: record.uploadedAt,
				hash: record.hash ?? null,
				userId: record.userId ?? null,
				anonymousSessionId: record.anonymousSessionId ?? null
			}
		});
}

export async function getUploadMetadataByKey(
	storageKey: string
): Promise<UploadMetadataRecord | null> {
	await ensureStoredUploadTable();
	const rows = await db.select().from(storedUpload).where(eq(storedUpload.storageKey, storageKey));
	const row = rows[0] ?? null;

	if (!row) return null;
	return mapRowToRecord(row);
}

export async function listUploadMetadata(
	scope: UploadAccessScope
): Promise<UploadMetadataRecord[]> {
	await ensureStoredUploadTable();
	const rows = await db
		.select()
		.from(storedUpload)
		.where(buildOwnershipWhere(scope))
		.orderBy(desc(storedUpload.uploadedAt));
	return rows.map(mapRowToRecord);
}

export async function renameUploadMetadata(
	storageKey: string,
	originalName: string,
	scope: UploadAccessScope
): Promise<boolean> {
	await ensureStoredUploadTable();
	const result = await db
		.update(storedUpload)
		.set({ originalName })
		.where(and(eq(storedUpload.storageKey, storageKey), buildOwnershipWhere(scope)));
	return Number(result.rowsAffected ?? 0) > 0;
}

export async function removeUploadMetadata(
	storageKey: string,
	scope: UploadAccessScope
): Promise<boolean> {
	await ensureStoredUploadTable();
	const result = await db
		.delete(storedUpload)
		.where(and(eq(storedUpload.storageKey, storageKey), buildOwnershipWhere(scope)));
	return Number(result.rowsAffected ?? 0) > 0;
}
