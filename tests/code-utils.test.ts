import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseLang } from '$lib/utils/code';
import { LocalStorage } from '$lib/hooks/local-storage.svelte';

function stubLocalStorage(store = new Map<string, string>()) {
	const localStorageMock = {
		getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
		setItem: (k: string, v: string) => {
			store.set(k, v);
		},
		removeItem: (k: string) => {
			store.delete(k);
		}
	};
	vi.stubGlobal('localStorage', localStorageMock);
	return store;
}

describe('code utils', () => {
	it('parses language label', () => {
		expect(parseLang('')).toBe('Text');
		expect(parseLang('language-typescript')).toBe('Typescript');
		expect(parseLang('language-text')).toBe('Text');
		expect(parseLang('language-plaintext')).toBe('Text');
	});
});

describe('LocalStorage', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('sets/gets and deletes', () => {
		stubLocalStorage();

		const ls = new LocalStorage<{ a: number }>('__test_key__', { a: 1 });
		ls.value = { a: 2 };
		expect(ls.value.a).toBe(2);

		ls.delete();
		expect(ls.value.a).toBe(1);
	});

	it('migrates a legacy key on first read', () => {
		const store = stubLocalStorage(new Map([['legacy_key', JSON.stringify({ a: 3 })]]));

		const ls = new LocalStorage<{ a: number }>(
			'rivo:v1:test:key',
			{ a: 1 },
			{
				legacyKeys: ['legacy_key']
			}
		);

		expect(ls.value.a).toBe(3);
		expect(store.get('rivo:v1:test:key')).toBe(JSON.stringify({ a: 3 }));
		expect(store.has('legacy_key')).toBe(false);
	});

	it('prefers the current key when both current and legacy values exist', () => {
		const store = stubLocalStorage(
			new Map([
				['rivo:v1:test:key', JSON.stringify({ a: 4 })],
				['legacy_key', JSON.stringify({ a: 3 })]
			])
		);

		const ls = new LocalStorage<{ a: number }>(
			'rivo:v1:test:key',
			{ a: 1 },
			{
				legacyKeys: ['legacy_key']
			}
		);

		expect(ls.value.a).toBe(4);
		expect(store.get('rivo:v1:test:key')).toBe(JSON.stringify({ a: 4 }));
		expect(store.has('legacy_key')).toBe(false);
	});
});
