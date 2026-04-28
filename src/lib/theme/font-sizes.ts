import { LocalStorage } from '$lib/hooks/local-storage.svelte';

export const FONT_SIZE_PRESETS = [
	{
		id: 'compact',
		labelKey: 'settings.font_size_compact',
		value: '15px'
	},
	{
		id: 'default',
		labelKey: 'settings.font_size_default',
		value: '17px'
	},
	{
		id: 'large',
		labelKey: 'settings.font_size_large',
		value: '19px'
	},
	{
		id: 'extra-large',
		labelKey: 'settings.font_size_extra_large',
		value: '21px'
	}
] as const;

export type FontSizePreset = (typeof FONT_SIZE_PRESETS)[number];
export type FontSizePresetId = FontSizePreset['id'];

export const DEFAULT_FONT_SIZE_PRESET_ID: FontSizePresetId = 'default';

const PRESET_BY_ID = new Map<string, FontSizePreset>(
	FONT_SIZE_PRESETS.map((preset) => [preset.id, preset])
);

export function isFontSizePresetId(id: string): id is FontSizePresetId {
	return PRESET_BY_ID.has(id);
}

export function getFontSizePreset(id: string): FontSizePreset | null {
	return PRESET_BY_ID.get(id) ?? null;
}

export const fontSizePreference = new LocalStorage<FontSizePresetId>(
	'app-font-size',
	DEFAULT_FONT_SIZE_PRESET_ID
);
