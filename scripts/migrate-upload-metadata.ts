import { createClient } from '@libsql/client';
import { config } from 'dotenv';
import { readFile } from 'fs/promises';
import { join } from 'path';

config({ path: '.env.local' });

type Attachment = {
	url?: unknown;
};

type UploadMetadataEntry = {
	url: string;
	originalName?: string;
	contentType?: string;
	size?: number;
	lastModified?: number;
	hash?: string;
	uploadedAt?: number;
	userId?: string | null;
	anonymousSessionId?: string | null;
};

type UploadMetadataMap = Record<string, UploadMetadataEntry>;

const METADATA_PATH = join('data', 'uploads', 'metadata.json');
const DB_URL = process.env.LIBSQL_URL ?? 'file:./data/app.db';

function isUploadUrl(value: unknown): value is string {
	return typeof value === 'string' && value.startsWith('/uploads/');
}

async function readMetadata(): Promise<UploadMetadataMap> {
	try {
		const raw = await readFile(METADATA_PATH, 'utf8');
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return {};
		}
		return parsed as UploadMetadataMap;
	} catch {
		return {};
	}
}

function normalizeAttachments(value: unknown): Attachment[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item) => item && typeof item === 'object') as Attachment[];
}

async function buildOwnersByUploadUrl() {
	const client = createClient({ url: DB_URL, authToken: process.env.LIBSQL_AUTH_TOKEN });
	const result = await client.execute(`
		SELECT Chat.userId AS userId, Message.attachments AS attachments
		FROM Message
		INNER JOIN Chat ON Message.chatId = Chat.id
	`);

	const ownersByUrl = new Map<string, Set<string>>();

	for (const row of result.rows) {
		const userId = typeof row.userId === 'string' ? row.userId : '';
		if (!userId) continue;

		let attachments: unknown = row.attachments;
		if (typeof attachments === 'string') {
			try {
				attachments = JSON.parse(attachments);
			} catch {
				continue;
			}
		}

		for (const attachment of normalizeAttachments(attachments)) {
			if (!isUploadUrl(attachment.url)) continue;
			if (!ownersByUrl.has(attachment.url)) {
				ownersByUrl.set(attachment.url, new Set());
			}
			ownersByUrl.get(attachment.url)!.add(userId);
		}
	}

	return ownersByUrl;
}

async function run() {
	const metadata = await readMetadata();
	const entries = Object.entries(metadata);
	if (entries.length === 0) {
		console.log('No upload metadata found at', METADATA_PATH);
		return;
	}

	const ownersByUrl = await buildOwnersByUploadUrl();
	const client = createClient({ url: DB_URL, authToken: process.env.LIBSQL_AUTH_TOKEN });
	await client.execute(`
		CREATE TABLE IF NOT EXISTS "StoredUpload" (
			"storageKey" text PRIMARY KEY NOT NULL,
			"originalName" text NOT NULL,
			"contentType" text NOT NULL,
			"size" integer NOT NULL,
			"lastModified" integer NOT NULL,
			"uploadedAt" integer NOT NULL,
			"hash" text,
			"userId" text,
			"anonymousSessionId" text
		)
	`);

	let migrated = 0;
	let unresolved = 0;
	let ambiguous = 0;
	const ambiguousUrls: string[] = [];
	const unresolvedUrls: string[] = [];

	for (const [url, entry] of entries) {
		const alreadyScoped = !!entry.userId || !!entry.anonymousSessionId;
		if (alreadyScoped) {
			if (entry.userId && entry.anonymousSessionId === undefined) {
				entry.anonymousSessionId = null;
			}
			continue;
		}

		const owners = ownersByUrl.get(url);
		if (!owners || owners.size === 0) {
			unresolved += 1;
			unresolvedUrls.push(url);
			continue;
		}

		if (owners.size > 1) {
			ambiguous += 1;
			ambiguousUrls.push(url);
			continue;
		}

		entry.userId = [...owners][0] ?? null;
		entry.anonymousSessionId = null;
	}

	for (const [, entry] of entries) {
		if (!isUploadUrl(entry.url)) {
			continue;
		}

		const storageKey = `uploads/${entry.url.slice('/uploads/'.length)}`;
		await client.execute({
			sql: `
				INSERT INTO "StoredUpload" (
					"storageKey",
					"originalName",
					"contentType",
					"size",
					"lastModified",
					"uploadedAt",
					"hash",
					"userId",
					"anonymousSessionId"
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT("storageKey") DO UPDATE SET
					"originalName" = excluded."originalName",
					"contentType" = excluded."contentType",
					"size" = excluded."size",
					"lastModified" = excluded."lastModified",
					"uploadedAt" = excluded."uploadedAt",
					"hash" = excluded."hash",
					"userId" = excluded."userId",
					"anonymousSessionId" = excluded."anonymousSessionId"
			`,
			args: [
				storageKey,
				entry.originalName ?? storageKey.split('/').pop() ?? storageKey,
				entry.contentType ?? 'application/octet-stream',
				entry.size ?? 0,
				entry.lastModified ?? Date.now(),
				entry.uploadedAt ?? Date.now(),
				entry.hash ?? null,
				entry.userId ?? null,
				entry.anonymousSessionId ?? null
			]
		});
		migrated += 1;
	}

	console.log(
		JSON.stringify(
			{
				metadataPath: METADATA_PATH,
				totalEntries: entries.length,
				migrated,
				ambiguous,
				unresolved
			},
			null,
			2
		)
	);

	if (ambiguousUrls.length > 0) {
		console.log('Ambiguous upload ownership (manual review needed):');
		for (const url of ambiguousUrls.slice(0, 20)) {
			console.log(` - ${url}`);
		}
	}

	if (unresolvedUrls.length > 0) {
		console.log('Unresolved upload ownership (not referenced by persisted chats):');
		for (const url of unresolvedUrls.slice(0, 20)) {
			console.log(` - ${url}`);
		}
	}
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
