import { on } from 'svelte/events';
import { readStorageValueWithLegacy, removeStorageKeys } from '$lib/utils/storage-keys';

type Serializer<T> = {
	toJSON: (value: T) => string;
	fromJSON: (text: string, fallback: T) => T;
};

type LocalStorageOptions<T> = Partial<Serializer<T>> & {
	legacyKeys?: string[];
};

/**
 * LocalStorage class provides a type-safe wrapper around the browser's localStorage.
 * It uses Svelte 5 runes for reactivity and supports cross-tab synchronization.
 */
export class LocalStorage<T> {
	#key: string;
	#legacyKeys: string[];
	#defaultValue: T;
	#serializer: Serializer<T>;
	#value = $state<T>() as T;
	#unsubscribe: (() => void) | null = null;

	/**
	 * @param key The localStorage key.
	 * @param defaultValue The value to use if no value is stored.
	 * @param options Optional serializer/deserializer and legacy migration keys.
	 */
	constructor(key: string, defaultValue: T, options?: LocalStorageOptions<T>) {
		const { legacyKeys = [], ...serializer } = options ?? {};
		this.#key = key;
		this.#legacyKeys = legacyKeys.filter((legacyKey) => legacyKey !== key);
		this.#defaultValue = defaultValue;
		this.#serializer = {
			toJSON: (v: T) => JSON.stringify(v),
			fromJSON: (text: string, fallback: T) => {
				try {
					return JSON.parse(text) as T;
				} catch {
					return fallback;
				}
			},
			...serializer
		} as Serializer<T>;

		this.#value = this.#load();

		if (typeof window !== 'undefined') {
			this.#unsubscribe = on(window, 'storage', (event) => {
				if (event.key === this.#key) {
					this.#value = this.#load();
				}
			});
		}
	}

	#load(): T {
		const storedValue = readStorageValueWithLegacy(this.#key, this.#legacyKeys);
		if (storedValue === null) return this.#defaultValue;
		return this.#serializer.fromJSON(storedValue, this.#defaultValue);
	}

	/** Returns the current value from storage */
	get value(): T {
		return this.#value;
	}

	/** Updates the value in storage and triggers reactivity */
	set value(v: T) {
		this.#value = v;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(this.#key, this.#serializer.toJSON(v));
			removeStorageKeys(...this.#legacyKeys);
		}
	}

	/** Removes the item from storage and resets to default value */
	delete() {
		if (typeof localStorage !== 'undefined') {
			removeStorageKeys(this.#key, ...this.#legacyKeys);
		}
		this.#value = this.#defaultValue;
	}

	destroy() {
		this.#unsubscribe?.();
		this.#unsubscribe = null;
	}
}
