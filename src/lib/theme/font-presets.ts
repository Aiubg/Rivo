import { LocalStorage } from '$lib/hooks/local-storage.svelte';

export const FONT_PRESETS = [
	{
		id: 'inter',
		labelKey: 'settings.font_inter',
		stack:
			"'Inter', 'Noto Sans', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
	},
	{
		id: 'system',
		labelKey: 'settings.font_system_default',
		stack: "'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
	}
] as const;

export type FontPreset = (typeof FONT_PRESETS)[number];
export type FontPresetId = FontPreset['id'];

export const DEFAULT_FONT_PRESET_ID: FontPresetId = 'inter';

const PRESET_BY_ID = new Map<string, FontPreset>(FONT_PRESETS.map((preset) => [preset.id, preset]));

export function isFontPresetId(id: string): id is FontPresetId {
	return PRESET_BY_ID.has(id);
}

export function getFontPreset(id: string): FontPreset | null {
	return PRESET_BY_ID.get(id) ?? null;
}

export const fontPreference = new LocalStorage<FontPresetId>(
	'app-font-family',
	DEFAULT_FONT_PRESET_ID
);
