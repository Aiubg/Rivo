import { LocalStorage } from '$lib/hooks/local-storage.svelte';
import interRegularUrl from '$lib/assets/fonts/Inter/Inter-VariableFont_opsz,wght.ttf?url';
import interItalicUrl from '$lib/assets/fonts/Inter/Inter-Italic-VariableFont_opsz,wght.ttf?url';
import notoSansScUrl from '$lib/assets/fonts/Noto_Sans_SC/NotoSansSC-wght.ttf?url';
import oppoRegularUrl from '$lib/assets/fonts/Oppo_Sans/OppoSans-Regular.ttf?url';
import harmonyRegularUrl from '$lib/assets/fonts/HarmonyOS_Sans_SC/HarmonyOS_Sans_SC_Regular.ttf?url';
import harmonyMediumUrl from '$lib/assets/fonts/HarmonyOS_Sans_SC/HarmonyOS_Sans_SC_Medium.ttf?url';
import harmonyBoldUrl from '$lib/assets/fonts/HarmonyOS_Sans_SC/HarmonyOS_Sans_SC_Bold.ttf?url';

const SYSTEM_FONT_STACK =
	"'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const INTER_FONT_STACK = `'Inter', ${SYSTEM_FONT_STACK}`;
const NOTO_SANS_SC_FONT_STACK = `'Noto Sans SC', ${SYSTEM_FONT_STACK}`;
const OPPO_FONT_STACK = `'Oppo Sans', ${INTER_FONT_STACK}`;
const HARMONY_FONT_STACK = `'HarmonyOS Sans SC', ${SYSTEM_FONT_STACK}`;

const INTER_FONT_FACE_CSS = `
@font-face {
	font-family: 'Inter';
	font-style: normal;
	font-weight: 100 900;
	src: url('${interRegularUrl}') format('truetype');
	font-display: swap;
}

@font-face {
	font-family: 'Inter';
	font-style: italic;
	font-weight: 100 900;
	src: url('${interItalicUrl}') format('truetype');
	font-display: swap;
}
`.trim();

const OPPO_FONT_FACE_CSS = `
${INTER_FONT_FACE_CSS}

@font-face {
	font-family: 'Oppo Sans';
	font-style: normal;
	font-weight: 400;
	src: url('${oppoRegularUrl}') format('truetype');
	font-display: swap;
}
`.trim();

const NOTO_SANS_SC_FONT_FACE_CSS = `
@font-face {
	font-family: 'Noto Sans SC';
	font-style: normal;
	font-weight: 100 900;
	src: url('${notoSansScUrl}') format('truetype');
	font-display: swap;
}
`.trim();

const HARMONY_FONT_FACE_CSS = `
@font-face {
	font-family: 'HarmonyOS Sans SC';
	font-style: normal;
	font-weight: 400;
	src: url('${harmonyRegularUrl}') format('truetype');
	font-display: swap;
}

@font-face {
	font-family: 'HarmonyOS Sans SC';
	font-style: normal;
	font-weight: 500;
	src: url('${harmonyMediumUrl}') format('truetype');
	font-display: swap;
}

@font-face {
	font-family: 'HarmonyOS Sans SC';
	font-style: normal;
	font-weight: 700;
	src: url('${harmonyBoldUrl}') format('truetype');
	font-display: swap;
}
`.trim();

export const FONT_PRESETS = [
	{
		id: 'system',
		labelKey: 'settings.font_system_default',
		stack: SYSTEM_FONT_STACK
	},
	{
		id: 'inter',
		labelKey: 'settings.font_inter',
		stack: INTER_FONT_STACK
	},
	{
		id: 'oppo-sans',
		labelKey: 'settings.font_oppo_sans',
		stack: OPPO_FONT_STACK
	},
	{
		id: 'noto-sans-sc',
		labelKey: 'settings.font_noto_sans_sc',
		stack: NOTO_SANS_SC_FONT_STACK
	},
	{
		id: 'harmonyos-sans-sc',
		labelKey: 'settings.font_harmonyos_sans_sc',
		stack: HARMONY_FONT_STACK
	}
] as const;

export type FontPreset = (typeof FONT_PRESETS)[number];
export type FontPresetId = FontPreset['id'];

export const DEFAULT_FONT_PRESET_ID: FontPresetId = 'system';

const PRESET_BY_ID = new Map<string, FontPreset>(FONT_PRESETS.map((preset) => [preset.id, preset]));

export function isFontPresetId(id: string): id is FontPresetId {
	return PRESET_BY_ID.has(id);
}

export function getFontPreset(id: string): FontPreset | null {
	return PRESET_BY_ID.get(id) ?? null;
}

export function getFontFaceCss(id: string): string {
	if (id === 'inter') {
		return INTER_FONT_FACE_CSS;
	}

	if (id === 'oppo-sans') {
		return OPPO_FONT_FACE_CSS;
	}

	if (id === 'noto-sans-sc') {
		return NOTO_SANS_SC_FONT_FACE_CSS;
	}

	if (id === 'harmonyos-sans-sc') {
		return HARMONY_FONT_FACE_CSS;
	}

	return '';
}

export const fontPreference = new LocalStorage<FontPresetId>(
	'app-font-family',
	DEFAULT_FONT_PRESET_ID
);
