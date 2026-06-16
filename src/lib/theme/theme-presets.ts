export const THEME_PRESETS = [
	{ id: 'neutral', labelKey: 'settings.color_theme_neutral', color: '#737373' },
	{ id: 'claude', labelKey: 'settings.color_theme_claude', color: '#D97757' }
] as const;

export type ThemePreset = (typeof THEME_PRESETS)[number];
export type ThemePresetId = ThemePreset['id'];

export const DEFAULT_THEME_ID: ThemePresetId = 'neutral';

const PRESET_BY_ID = new Map<string, ThemePreset>(
	THEME_PRESETS.map((preset) => [preset.id, preset])
);

export function getThemePreset(id: string): ThemePreset | null {
	return PRESET_BY_ID.get(id) ?? null;
}

export function isThemePresetId(id: string): id is ThemePresetId {
	return PRESET_BY_ID.has(id);
}
