import { describe, expect, it } from 'vitest';
import {
	DEFAULT_FONT_PRESET_ID,
	FONT_PRESETS,
	getFontFaceCss,
	getFontPreset,
	isFontPresetId
} from '$lib/theme/font-presets';
import {
	DEFAULT_FONT_SIZE_PRESET_ID,
	FONT_SIZE_PRESETS,
	getFontSizePreset,
	isFontSizePresetId
} from '$lib/theme/font-sizes';

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
		expect(getFontFaceCss('noto-sans-sc')).toContain("font-family: 'Noto Sans SC'");
		expect(getFontFaceCss('harmonyos-sans-sc')).toContain("font-family: 'HarmonyOS Sans SC'");
	});
});

describe('font size presets', () => {
	it('uses the existing base font size as the default preset', () => {
		expect(DEFAULT_FONT_SIZE_PRESET_ID).toBe('default');
		expect(isFontSizePresetId(DEFAULT_FONT_SIZE_PRESET_ID)).toBe(true);
		expect(FONT_SIZE_PRESETS.some((preset) => preset.id === DEFAULT_FONT_SIZE_PRESET_ID)).toBe(
			true
		);
		expect(getFontSizePreset(DEFAULT_FONT_SIZE_PRESET_ID)?.value).toBe('17px');
	});

	it('rejects unknown font size presets', () => {
		expect(isFontSizePresetId('massive')).toBe(false);
		expect(getFontSizePreset('massive')).toBeNull();
	});
});
