import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	clearStoredRunCursor,
	getRunCursorStorageKey,
	persistStoredRunCursor,
	readStoredRunCursor
} from '$lib/hooks/chat-state/run-stream';

function stubBrowserStorage(store = new Map<string, string>()) {
	vi.stubGlobal('window', {});
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		}
	});
	return store;
}

describe('run stream storage', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('uses namespaced run cursor keys', () => {
		expect(getRunCursorStorageKey('run-1')).toBe('rivo:v1:run:cursor:run-1');
	});

	it('migrates legacy run cursor values', () => {
		const store = stubBrowserStorage(new Map([['run_cursor_run-1', '12']]));

		expect(readStoredRunCursor('run-1', 0)).toBe(12);
		expect(store.get('rivo:v1:run:cursor:run-1')).toBe('12');
		expect(store.has('run_cursor_run-1')).toBe(false);
	});

	it('writes and clears current and legacy run cursor keys', () => {
		const store = stubBrowserStorage(new Map([['run_cursor_run-1', '9']]));

		persistStoredRunCursor('run-1', 14);
		expect(store.get('rivo:v1:run:cursor:run-1')).toBe('14');
		expect(store.has('run_cursor_run-1')).toBe(false);

		store.set('run_cursor_run-1', '15');
		clearStoredRunCursor('run-1');
		expect(store.has('rivo:v1:run:cursor:run-1')).toBe(false);
		expect(store.has('run_cursor_run-1')).toBe(false);
	});
});
