const STORAGE_KEY_PREFIX = 'rivo:v1';
const NEW_CHAT_DRAFT_ID = 'new';

function scopedStorageKey(...segments: string[]): string {
	return [STORAGE_KEY_PREFIX, ...segments].join(':');
}

function normalizeOptionalId(value: string | null | undefined, fallback: string): string {
	const normalized = typeof value === 'string' ? value.trim() : '';
	return normalized.length > 0 ? normalized : fallback;
}

export const storageKeys = {
	chatPath(chatId: string): string {
		return scopedStorageKey('chat', 'path', chatId.trim());
	},

	runCursor(runId: string): string {
		return scopedStorageKey('run', 'cursor', runId.trim());
	},

	chatDraft(chatId?: string | null): string {
		return scopedStorageKey('chat', 'draft', normalizeOptionalId(chatId, NEW_CHAT_DRAFT_ID));
	},

	layout: {
		searchSidebar: scopedStorageKey('layout', 'search-sidebar'),
		shareSidebar: scopedStorageKey('layout', 'share-sidebar'),
		files: scopedStorageKey('layout', 'files')
	},

	preference: {
		colorTheme: scopedStorageKey('preference', 'color-theme'),
		fontSize: scopedStorageKey('preference', 'font-size'),
		fontFamily: scopedStorageKey('preference', 'font-family'),
		language: scopedStorageKey('preference', 'language'),
		personalization: scopedStorageKey('preference', 'personalization')
	}
} as const;

export const legacyStorageKeys = {
	chatPath(chatId: string): string {
		return `chat_path_${chatId}`;
	},

	runCursor(runId: string): string {
		return `run_cursor_${runId}`;
	},

	chatDraft(chatId?: string | null): string {
		return `chat_input_draft:${normalizeOptionalId(chatId, NEW_CHAT_DRAFT_ID)}`;
	},

	layout: {
		searchSidebar: 'rivo-search-sidebar-layout',
		shareSidebar: 'rivo-share-sidebar-layout',
		files: 'rivo-files-layout'
	},

	preference: {
		colorTheme: 'app-color-theme',
		fontSize: 'app-font-size',
		fontFamily: 'app-font-family',
		language: 'app-language',
		personalization: 'app-personalization'
	}
} as const;

function getUsableStorageValue(key: string): string | null {
	if (typeof localStorage === 'undefined') return null;
	const value = localStorage.getItem(key);
	return value === null || value.trim() === '' ? null : value;
}

export function readStorageValueWithLegacy(key: string, legacyKeys: string[] = []): string | null {
	if (typeof localStorage === 'undefined') return null;

	const current = getUsableStorageValue(key);
	if (current !== null) {
		removeStorageKeys(...legacyKeys);
		return current;
	}

	for (const legacyKey of legacyKeys) {
		const legacyValue = getUsableStorageValue(legacyKey);
		if (legacyValue === null) continue;

		localStorage.setItem(key, legacyValue);
		removeStorageKeys(...legacyKeys);
		return legacyValue;
	}

	return null;
}

export function migrateStorageValue(key: string, legacyKeys: string[] = []): void {
	void readStorageValueWithLegacy(key, legacyKeys);
}

export function removeStorageKeys(...keys: string[]): void {
	if (typeof localStorage === 'undefined') return;
	for (const key of keys) {
		localStorage.removeItem(key);
	}
}
