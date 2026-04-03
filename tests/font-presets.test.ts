import { describe, expect, it } from 'vitest';
import {
	DEFAULT_FONT_PRESET_ID,
	FONT_PRESETS,
	getFontFaceCss,
	getFontPreset,
	isFontPresetId
} from '$lib/theme/font-presets';

describe('font presets', () => {
	it('uses the system stack as the default preset', () => {
		expect(DEFAULT_FONT_PRESET_ID).toBe('system');
		expect(isFontPresetId(DEFAULT_FONT_PRESET_ID)).toBe(true);
		expect(FONT_PRESETS.some((preset) => preset.id === DEFAULT_FONT_PRESET_ID)).toBe(true);
		expect(getFontPreset(DEFAULT_FONT_PRESET_ID)?.stack).toContain('system-ui');
	});

	it('does not emit @font-face rules for the system preset', () => {
		expect(getFontFaceCss('system')).toBe('');
	});

	it('emits @font-face rules only for opt-in custom presets', () => {
		expect(getFontFaceCss('inter')).toContain("font-family: 'Inter'");
		expect(getFontFaceCss('oppo-sans')).toContain("font-family: 'Oppo Sans'");
		expect(getFontFaceCss('harmonyos-sans-sc')).toContain("font-family: 'HarmonyOS Sans SC'");
	});
});
