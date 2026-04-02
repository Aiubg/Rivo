import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { disposeDatabasePort } from '$lib/server/db/runtime';

vi.mock('$lib/utils/constants', () => ({
	allowAnonymousChats: true
}));

import { GET as listFilesRoute } from '../src/routes/(chat)/api/files/+server';
import { GET as previewFileRoute } from '../src/routes/(chat)/api/files/preview/+server';
import { PATCH as renameFileRoute } from '../src/routes/(chat)/api/files/rename/+server';
import { DELETE as deleteFileRoute } from '../src/routes/(chat)/api/files/delete/+server';
import { upsertUploadMetadata } from '$lib/server/files/upload-store';

const originalCwd = process.cwd();
let testRoot = '';

beforeEach(async () => {
	testRoot = await mkdtemp(join(tmpdir(), 'rivo-file-routes-'));
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

describe('file api routes', () => {
	it('lists only files owned by the current anonymous session', async () => {
		await writeFile(join('static', 'uploads', 'anon-a.txt'), 'alpha');
		await writeFile(join('static', 'uploads', 'anon-b.txt'), 'beta');

		await upsertUploadMetadata({
			url: '/uploads/anon-a.txt',
			originalName: 'anon-a.txt',
			contentType: 'text/plain',
			size: 5,
			lastModified: 1,
			userId: null,
			anonymousSessionId: 'anon-a'
		});
		await upsertUploadMetadata({
			url: '/uploads/anon-b.txt',
			originalName: 'anon-b.txt',
			contentType: 'text/plain',
			size: 4,
			lastModified: 2,
			userId: null,
			anonymousSessionId: 'anon-b'
		});

		const response = await listFilesRoute({
			locals: { anonymousSessionId: 'anon-a' },
			url: new URL('http://localhost/api/files')
		} as never);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			files: Array<{ url: string; originalName: string }>;
		};
		expect(payload.files).toHaveLength(1);
		expect(payload.files[0]?.url).toBe('/uploads/anon-a.txt');
		expect(payload.files[0]?.originalName).toBe('anon-a.txt');
	});

	it('rejects preview access for another anonymous session', async () => {
		await writeFile(join('static', 'uploads', 'private.txt'), 'secret');
		await upsertUploadMetadata({
			url: '/uploads/private.txt',
			originalName: 'private.txt',
			contentType: 'text/plain',
			size: 6,
			lastModified: 1,
			userId: null,
			anonymousSessionId: 'anon-owner'
		});

		await expect(
			previewFileRoute({
				locals: { anonymousSessionId: 'anon-other' },
				url: new URL('http://localhost/api/files/preview?url=%2Fuploads%2Fprivate.txt')
			} as never)
		).rejects.toMatchObject({ status: 403 });
	});

	it('renames owned files and blocks cross-session deletion', async () => {
		await writeFile(join('static', 'uploads', 'owned.txt'), 'owned');
		await upsertUploadMetadata({
			url: '/uploads/owned.txt',
			originalName: 'before.txt',
			contentType: 'text/plain',
			size: 5,
			lastModified: 1,
			userId: null,
			anonymousSessionId: 'anon-owner'
		});

		const renameResponse = await renameFileRoute({
			locals: { anonymousSessionId: 'anon-owner' },
			request: new Request('http://localhost/api/files/rename', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: '/uploads/owned.txt', name: 'after.txt' })
			})
		} as never);

		expect(renameResponse.status).toBe(200);

		const listResponse = await listFilesRoute({
			locals: { anonymousSessionId: 'anon-owner' },
			url: new URL('http://localhost/api/files')
		} as never);
		const listed = (await listResponse.json()) as {
			files: Array<{ originalName: string }>;
		};
		expect(listed.files[0]?.originalName).toBe('after.txt');

		await expect(
			deleteFileRoute({
				locals: { anonymousSessionId: 'anon-other' },
				request: new Request('http://localhost/api/files/delete', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ url: '/uploads/owned.txt' })
				})
			} as never)
		).rejects.toMatchObject({ status: 403 });

		const deleteResponse = await deleteFileRoute({
			locals: { anonymousSessionId: 'anon-owner' },
			request: new Request('http://localhost/api/files/delete', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: '/uploads/owned.txt' })
			})
		} as never);

		expect(deleteResponse.status).toBe(200);
		await expect(readFile(join('static', 'uploads', 'owned.txt'), 'utf8')).rejects.toMatchObject({
			code: 'ENOENT'
		});
	});
});
