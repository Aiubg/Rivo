import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { disposeDatabasePort } from '$lib/server/db/runtime';
import {
	getUploadPreview,
	listStoredUploads,
	upsertUploadMetadata
} from '$lib/server/files/upload-store';
import { UploadForbiddenError } from '$lib/server/errors/upload';
import { getServerContainer } from '$lib/server/composition/server-container';

const originalCwd = process.cwd();
let testRoot = '';

function blobUrl(name: string): string {
	return `/api/files/blob/${name}`;
}

beforeEach(async () => {
	testRoot = await mkdtemp(join(tmpdir(), 'rivo-upload-store-'));
	process.chdir(testRoot);
	process.env.LIBSQL_URL = 'file::memory:';
	process.env.DB_DRIVER = 'libsql-local';
	process.env.STORAGE_DRIVER = 'local-fs';
	await mkdir(join('static', 'uploads'), { recursive: true });
});

afterEach(async () => {
	await disposeDatabasePort();
	delete process.env.LIBSQL_URL;
	delete process.env.DB_DRIVER;
	delete process.env.STORAGE_DRIVER;
	process.chdir(originalCwd);
	if (testRoot) {
		try {
			await rm(testRoot, { recursive: true, force: true });
		} catch (error) {
			if (!(typeof error === 'object' && error && 'code' in error && error.code === 'EBUSY')) {
				throw error;
			}
		}
		testRoot = '';
	}
});

describe('upload-store metadata writes', () => {
	it('keeps originalName for concurrent uploads', async () => {
		const fixtures = [
			{
				url: '/uploads/a1.txt',
				storedName: 'a1.txt',
				originalName: 'budget-q1.txt'
			},
			{
				url: '/uploads/b2.txt',
				storedName: 'b2.txt',
				originalName: 'roadmap-notes.txt'
			},
			{
				url: '/uploads/c3.txt',
				storedName: 'c3.txt',
				originalName: 'meeting-summary.txt'
			}
		];

		await Promise.all(
			fixtures.map((item) =>
				writeFile(join('static', 'uploads', item.storedName), `content:${item.storedName}`)
			)
		);

		await Promise.all(
			fixtures.map((item, index) =>
				upsertUploadMetadata({
					url: item.url,
					originalName: item.originalName,
					contentType: 'text/plain',
					size: 100 + index,
					lastModified: Date.now() + index,
					hash: item.storedName.replace('.txt', ''),
					userId: 'user-a',
					anonymousSessionId: null
				})
			)
		);

		const files = await listStoredUploads({ type: 'user', userId: 'user-a' });
		const originalNameByUrl = new Map(files.map((file) => [file.url, file.originalName]));

		for (const item of fixtures) {
			expect(originalNameByUrl.get(blobUrl(item.storedName))).toBe(item.originalName);
		}
	});

	it('filters and protects uploads by owner for authenticated users', async () => {
		await writeFile(join('static', 'uploads', 'u1.txt'), 'alpha');
		await writeFile(join('static', 'uploads', 'u2.txt'), 'beta');

		await upsertUploadMetadata({
			url: '/uploads/u1.txt',
			originalName: 'alpha.txt',
			contentType: 'text/plain',
			size: 5,
			lastModified: 1,
			hash: 'u1',
			userId: 'user-1',
			anonymousSessionId: null
		});
		await upsertUploadMetadata({
			url: '/uploads/u2.txt',
			originalName: 'beta.txt',
			contentType: 'text/plain',
			size: 4,
			lastModified: 2,
			hash: 'u2',
			userId: 'user-2',
			anonymousSessionId: null
		});

		const user1Files = await listStoredUploads({ type: 'user', userId: 'user-1' });

		expect(user1Files).toHaveLength(1);
		expect(user1Files[0]?.url).toBe(blobUrl('u1.txt'));

		await expect(
			getUploadPreview('/uploads/u2.txt', { type: 'user', userId: 'user-1' })
		).rejects.toBeInstanceOf(UploadForbiddenError);
	});

	it('isolates anonymous uploads by anonymous session id', async () => {
		await writeFile(join('static', 'uploads', 'anon-1.txt'), 'first');
		await writeFile(join('static', 'uploads', 'anon-2.txt'), 'second');

		await upsertUploadMetadata({
			url: '/uploads/anon-1.txt',
			originalName: 'anon-1.txt',
			contentType: 'text/plain',
			size: 5,
			lastModified: 1,
			hash: 'anon-1',
			userId: null,
			anonymousSessionId: 'anon-a'
		});
		await upsertUploadMetadata({
			url: '/uploads/anon-2.txt',
			originalName: 'anon-2.txt',
			contentType: 'text/plain',
			size: 6,
			lastModified: 2,
			hash: 'anon-2',
			userId: null,
			anonymousSessionId: 'anon-b'
		});

		const anonFiles = await listStoredUploads({
			type: 'anonymous',
			anonymousSessionId: 'anon-a'
		});

		expect(anonFiles).toHaveLength(1);
		expect(anonFiles[0]?.url).toBe(blobUrl('anon-1.txt'));

		await expect(
			getUploadPreview('/uploads/anon-2.txt', {
				type: 'anonymous',
				anonymousSessionId: 'anon-a'
			})
		).rejects.toBeInstanceOf(UploadForbiddenError);
	});

	it('keeps identical uploaded bytes isolated per owner', async () => {
		const service = getServerContainer().services.files;
		const fileA = new File(['shared content'], 'notes.txt', {
			type: 'text/plain',
			lastModified: 10
		});
		const fileB = new File(['shared content'], 'notes.txt', {
			type: 'text/plain',
			lastModified: 20
		});

		const savedA = await service.saveUpload({
			file: fileA,
			scope: { type: 'user', userId: 'user-a' }
		});
		const savedB = await service.saveUpload({
			file: fileB,
			scope: { type: 'user', userId: 'user-b' }
		});

		expect(savedA.hash).toBe(savedB.hash);
		expect(savedA.url).not.toBe(savedB.url);
		expect(savedA.url).toMatch(/^\/api\/files\/blob\/users\/[a-f0-9]{32}\/[a-f0-9]{64}\.txt$/);
		expect(savedB.url).toMatch(/^\/api\/files\/blob\/users\/[a-f0-9]{32}\/[a-f0-9]{64}\.txt$/);

		const userAFiles = await listStoredUploads({ type: 'user', userId: 'user-a' });
		const userBFiles = await listStoredUploads({ type: 'user', userId: 'user-b' });
		expect(userAFiles.map((file) => file.url)).toEqual([savedA.url]);
		expect(userBFiles.map((file) => file.url)).toEqual([savedB.url]);

		await service.removeUpload(savedA.url, { type: 'user', userId: 'user-a' });

		await expect(
			getUploadPreview(savedA.url, { type: 'user', userId: 'user-a' })
		).rejects.toBeInstanceOf(UploadForbiddenError);
		await expect(getUploadPreview(savedB.url, { type: 'user', userId: 'user-b' })).resolves.toEqual(
			{
				content: 'shared content',
				contentType: 'text/plain'
			}
		);
	});

	it('does not treat extensionless filenames as storage extensions', async () => {
		const service = getServerContainer().services.files;
		const saved = await service.saveUpload({
			file: new File(['hello'], 'README', { type: 'text/plain', lastModified: 1 }),
			scope: { type: 'anonymous', anonymousSessionId: 'anon-readme' }
		});

		expect(saved.url).toMatch(/^\/api\/files\/blob\/anonymous\/[a-f0-9]{32}\/[a-f0-9]{64}$/);
		expect(saved.url).not.toContain('.README');
		expect(saved.contentType).toBe('text/plain');
	});
});
