import { describe, expect, it } from 'vitest';
import {
	getVisibleManagedFiles,
	mergeManagedFiles,
	normalizeManagedFiles,
	patchManagedFile,
	removeManagedFile,
	renameManagedFile,
	type ManagedFile
} from '$lib/services/file-library';
import {
	formatFileSize,
	getStoredUploadName,
	guessContentType,
	supportsTextDecoding,
	supportsTextPreview
} from '$lib/utils/files';

function createManagedFile(overrides: Partial<ManagedFile> = {}): ManagedFile {
	return {
		url: '/uploads/example.txt',
		storedName: 'example.txt',
		originalName: 'example.txt',
		contentType: 'text/plain',
		size: 128,
		lastModified: 1,
		uploadedAt: 2,
		...overrides
	};
}

describe('file helpers', () => {
	it('detects preview support consistently for text and office files', () => {
		expect(supportsTextPreview('notes.md', 'text/markdown')).toBe(true);
		expect(supportsTextPreview('draft.docx', 'application/octet-stream')).toBe(true);
		expect(supportsTextDecoding('script.sh', 'application/octet-stream')).toBe(true);
		expect(supportsTextPreview('photo.png', 'image/png')).toBe(false);
	});

	it('formats upload metadata consistently', () => {
		expect(getStoredUploadName('/uploads/demo.sql')).toBe('demo.sql');
		expect(guessContentType('report.xlsx')).toBe(
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		);
		expect(formatFileSize(1536)).toBe('1.5 KB');
	});
});

describe('managed file helpers', () => {
	it('preserves preview state when the file list refreshes', () => {
		const previousFiles = [
			createManagedFile({
				url: '/uploads/a.txt',
				storedName: 'a.txt',
				originalName: 'a.txt',
				previewContent: 'cached preview'
			})
		];

		const refreshed = normalizeManagedFiles(
			[
				{
					url: '/uploads/a.txt',
					storedName: 'a.txt',
					originalName: 'renamed-a.txt',
					contentType: 'text/plain',
					size: 512,
					lastModified: 10,
					uploadedAt: 20
				}
			],
			previousFiles
		);

		expect(refreshed[0]?.previewContent).toBe('cached preview');
		expect(refreshed[0]?.originalName).toBe('renamed-a.txt');
	});

	it('prepends new uploads while keeping existing previews intact', () => {
		const existingFiles = [
			createManagedFile({
				url: '/uploads/existing.txt',
				storedName: 'existing.txt',
				originalName: 'existing.txt',
				previewContent: 'cached preview'
			})
		];

		const merged = mergeManagedFiles(existingFiles, [
			createManagedFile({
				url: '/uploads/new.txt',
				storedName: 'new.txt',
				originalName: 'new.txt'
			}),
			createManagedFile({
				url: '/uploads/existing.txt',
				storedName: 'existing.txt',
				originalName: 'existing-renamed.txt'
			})
		]);

		expect(merged.map((file) => file.url)).toEqual(['/uploads/new.txt', '/uploads/existing.txt']);
		expect(merged[1]?.previewContent).toBe('cached preview');
		expect(merged[1]?.originalName).toBe('existing-renamed.txt');
	});

	it('filters and sorts visible files consistently', () => {
		const files = [
			createManagedFile({
				url: '/uploads/report.docx',
				storedName: 'report.docx',
				originalName: 'report.docx',
				contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				size: 200,
				uploadedAt: 20
			}),
			createManagedFile({
				url: '/uploads/zeta.txt',
				storedName: 'zeta.txt',
				originalName: 'zeta.txt',
				contentType: 'text/plain',
				size: 100,
				uploadedAt: 10
			}),
			createManagedFile({
				url: '/uploads/alpha.txt',
				storedName: 'alpha.txt',
				originalName: 'alpha.txt',
				contentType: 'text/plain',
				size: 300,
				uploadedAt: 30
			})
		];

		expect(getVisibleManagedFiles(files, 'text', 'name').map((file) => file.originalName)).toEqual([
			'alpha.txt',
			'zeta.txt'
		]);
		expect(
			getVisibleManagedFiles(files, 'office', 'created').map((file) => file.originalName)
		).toEqual(['report.docx']);
		expect(getVisibleManagedFiles(files, null, 'size').map((file) => file.originalName)).toEqual([
			'alpha.txt',
			'report.docx',
			'zeta.txt'
		]);
	});

	it('updates managed files immutably for patch, rename, and remove flows', () => {
		const files = [
			createManagedFile({
				url: '/uploads/a.txt',
				storedName: 'a.txt',
				originalName: 'a.txt'
			}),
			createManagedFile({
				url: '/uploads/b.txt',
				storedName: 'b.txt',
				originalName: 'b.txt'
			})
		];

		const patched = patchManagedFile(files, '/uploads/a.txt', {
			previewContent: 'cached preview',
			previewLoading: false
		});
		const renamed = renameManagedFile(patched, '/uploads/b.txt', 'renamed-b.txt');
		const removed = removeManagedFile(renamed, '/uploads/a.txt');

		expect(files[0]?.previewContent).toBeUndefined();
		expect(patched[0]?.previewContent).toBe('cached preview');
		expect(renamed[1]?.originalName).toBe('renamed-b.txt');
		expect(removed.map((file) => file.url)).toEqual(['/uploads/b.txt']);
	});
});
