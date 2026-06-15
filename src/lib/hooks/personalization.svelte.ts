import { LocalStorage } from '$lib/hooks/local-storage.svelte';
import { legacyStorageKeys, storageKeys } from '$lib/utils/storage-keys';

type ToneType = 'default' | 'professional' | 'humorous' | 'warm' | 'enthusiastic';

type PersonalizationSettings = {
	tone: ToneType;
	customInstructions: string;
};

const DEFAULT_SETTINGS: PersonalizationSettings = {
	tone: 'default',
	customInstructions: ''
};

export const personalization = new LocalStorage<PersonalizationSettings>(
	storageKeys.preference.personalization,
	DEFAULT_SETTINGS,
	{
		legacyKeys: [legacyStorageKeys.preference.personalization],
		fromJSON: (text, fallback) => {
			try {
				const parsed = JSON.parse(text);
				return {
					...fallback,
					tone: typeof parsed.tone === 'string' ? parsed.tone : fallback.tone,
					customInstructions:
						typeof parsed.customInstructions === 'string'
							? parsed.customInstructions
							: fallback.customInstructions
				};
			} catch {
				return fallback;
			}
		}
	}
);
