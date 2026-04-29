export const THINKING_MODES = ['enabled', 'disabled'] as const;

export type ThinkingMode = (typeof THINKING_MODES)[number];

export type ModelRequestOptions = {
	thinking?: {
		mode?: ThinkingMode;
	};
};

export function normalizeModelRequestOptions(
	options: ModelRequestOptions | null | undefined
): ModelRequestOptions {
	const thinkingMode = options?.thinking?.mode;
	return thinkingMode ? { thinking: { mode: thinkingMode } } : {};
}
