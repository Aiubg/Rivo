import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	legacyStorageKeys,
	readStorageValueWithLegacy,
	removeStorageKeys,
	storageKeys
} from '$lib/utils/storage-keys';

function stubLocalStorage(store = new Map<string, string>()) {
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

describe('storage keys', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('builds namespaced current keys and exposes legacy keys', () => {
		expect(storageKeys.chatPath('chat-1')).toBe('rivo:v1:chat:path:chat-1');
		expect(storageKeys.runCursor('run-1')).toBe('rivo:v1:run:cursor:run-1');
		expect(storageKeys.chatDraft()).toBe('rivo:v1:chat:draft:new');
		expect(storageKeys.chatDraft('chat-1')).toBe('rivo:v1:chat:draft:chat-1');
		expect(storageKeys.layout.searchSidebar).toBe('rivo:v1:layout:search-sidebar');
		expect(storageKeys.preference.language).toBe('rivo:v1:preference:language');

		expect(legacyStorageKeys.chatPath('chat-1')).toBe('chat_path_chat-1');
		expect(legacyStorageKeys.runCursor('run-1')).toBe('run_cursor_run-1');
		expect(legacyStorageKeys.chatDraft()).toBe('chat_input_draft:new');
	});

	it('migrates the first usable legacy value into the current key', () => {
		const store = stubLocalStorage(new Map([['old-key', 'stored-value']]));

		expect(readStorageValueWithLegacy('rivo:v1:test:key', ['old-key'])).toBe('stored-value');
		expect(store.get('rivo:v1:test:key')).toBe('stored-value');
		expect(store.has('old-key')).toBe(false);
	});

	it('prefers current values over legacy values', () => {
		const store = stubLocalStorage(
			new Map([
				['rivo:v1:test:key', 'current'],
				['old-key', 'legacy']
			])
		);

		expect(readStorageValueWithLegacy('rivo:v1:test:key', ['old-key'])).toBe('current');
		expect(store.get('rivo:v1:test:key')).toBe('current');
		expect(store.has('old-key')).toBe(false);
	});

	it('removes multiple storage keys', () => {
		const store = stubLocalStorage(
			new Map([
				['one', '1'],
				['two', '2']
			])
		);

		removeStorageKeys('one', 'two');

		expect(store.has('one')).toBe(false);
		expect(store.has('two')).toBe(false);
	});
});
