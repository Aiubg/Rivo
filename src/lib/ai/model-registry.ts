import {
	normalizeModelRequestOptions,
	type ModelRequestOptions,
	type ThinkingMode
} from '$lib/ai/model-options';

export const DEFAULT_CHAT_MODEL: string = 'deepseek-chat';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type ProviderOptionsPreset = Record<string, { [key: string]: JsonValue }>;

export type ModelCapabilities = {
	vision?: boolean;
	imageGeneration?: boolean;
	reasoning?: boolean;
	thinkingMode?: boolean;
	toolUse?: boolean;
	jsonMode?: boolean;
};

export type ModelRequestPreset = {
	/**
	 * Forwarded to `streamText()` as provider-specific options.
	 * Example:
	 * { openrouter: { reasoning: { enabled: true } } }
	 */
	providerOptions?: ProviderOptionsPreset;
	thinkingMode?: {
		defaultMode?: ThinkingMode;
		providerOptions: Partial<Record<ThinkingMode, ProviderOptionsPreset>>;
	};
};

export type ModelRegistryItem = {
	id: string;
	name: string;
	description: string;
	provider: 'openrouter' | 'groq' | 'xai' | 'google' | 'anthropic' | 'deepseek' | 'openai';
	model: string;
	capabilities: ModelCapabilities;
	requestPreset?: ModelRequestPreset;
};

export const MODEL_REGISTRY: Array<ModelRegistryItem> = [
	{
		id: 'google-gemma-4-31b-it-free',
		name: 'Gemma 4 31B Instruct',
		description: 'OpenRouter free-tier Gemma model for chat, coding, and vision reasoning',
		provider: 'openrouter',
		model: 'google/gemma-4-31b-it:free',
		capabilities: {
			vision: true,
			toolUse: true,
			reasoning: true
		}
	},
	{
		id: 'tencent-hy3-preview-free',
		name: 'Tencent Hy3 Preview',
		description: 'OpenRouter free-tier Tencent model for agentic chat, coding, and reasoning',
		provider: 'openrouter',
		model: 'tencent/hy3-preview:free',
		capabilities: {
			reasoning: true
		}
	},
	{
		id: 'deepseek-chat',
		name: 'DeepSeek-Chat',
		description: 'Balanced chat model for writing, coding, and tool use',
		provider: 'deepseek',
		model: 'deepseek-chat',
		capabilities: {}
	},
	{
		id: 'deepseek-v4-flash',
		name: 'DeepSeek V4 Flash',
		description: 'Fast DeepSeek model for responsive chat and coding tasks',
		provider: 'deepseek',
		model: 'deepseek-v4-flash',
		capabilities: {
			reasoning: true,
			thinkingMode: true
		},
		requestPreset: {
			thinkingMode: {
				defaultMode: 'disabled',
				providerOptions: {
					enabled: {
						deepseek: {
							thinking: { type: 'enabled' }
						}
					},
					disabled: {
						deepseek: {
							thinking: { type: 'disabled' }
						}
					}
				}
			}
		}
	},
	{
		id: 'deepseek-reasoner',
		name: 'DeepSeek-Reasoner',
		description: 'Deeper reasoning model for complex problems and longer answers',
		provider: 'deepseek',
		model: 'deepseek-reasoner',
		capabilities: {
			reasoning: true
		}
	}
];

type ChatModel = Pick<ModelRegistryItem, 'id' | 'name' | 'description'>;
export const chatModels: Array<ChatModel> = MODEL_REGISTRY.map(({ id, name, description }) => ({
	id,
	name,
	description
}));

export function getModelRegistryItem(modelId: string): ModelRegistryItem | undefined {
	return MODEL_REGISTRY.find((item) => item.id === modelId);
}

export function getModelCapabilities(modelId: string): ModelCapabilities {
	return getModelRegistryItem(modelId)?.capabilities ?? {};
}

export function modelSupportsVision(modelId: string): boolean {
	return getModelCapabilities(modelId).vision === true;
}

export function modelSupportsThinkingMode(modelId: string): boolean {
	return (
		getModelCapabilities(modelId).thinkingMode === true ||
		getModelRequestPreset(modelId)?.thinkingMode !== undefined
	);
}

export function getModelRequestPreset(modelId: string): ModelRequestPreset | undefined {
	return getModelRegistryItem(modelId)?.requestPreset;
}

function mergeProviderOptions(
	current: ProviderOptionsPreset | undefined,
	next: ProviderOptionsPreset | undefined
): ProviderOptionsPreset | undefined {
	if (!next) return current;

	const merged: ProviderOptionsPreset = { ...(current ?? {}) };
	for (const [provider, providerOptions] of Object.entries(next)) {
		merged[provider] = {
			...(merged[provider] ?? {}),
			...providerOptions
		};
	}

	return merged;
}

function isEmptyProviderOptions(providerOptions: ProviderOptionsPreset | undefined): boolean {
	return !providerOptions || Object.keys(providerOptions).length === 0;
}

export function resolveModelRequestConfig({
	modelId,
	modelOptions
}: {
	modelId: string;
	modelOptions?: ModelRequestOptions | null;
}): {
	modelOptions: ModelRequestOptions;
	providerOptions?: ProviderOptionsPreset;
} {
	const requestPreset = getModelRequestPreset(modelId);
	let providerOptions = mergeProviderOptions(undefined, requestPreset?.providerOptions);
	const resolvedModelOptions: ModelRequestOptions = {};
	const normalizedModelOptions = normalizeModelRequestOptions(modelOptions);

	const configuredThinkingMode = normalizedModelOptions.thinking?.mode;
	const defaultThinkingMode = requestPreset?.thinkingMode?.defaultMode;
	const thinkingMode = configuredThinkingMode ?? defaultThinkingMode;

	if (thinkingMode && requestPreset?.thinkingMode) {
		resolvedModelOptions.thinking = { mode: thinkingMode };
		providerOptions = mergeProviderOptions(
			providerOptions,
			requestPreset.thinkingMode.providerOptions[thinkingMode]
		);
	}

	return {
		modelOptions: resolvedModelOptions,
		...(isEmptyProviderOptions(providerOptions) ? {} : { providerOptions })
	};
}
