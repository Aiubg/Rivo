export const DEFAULT_CHAT_MODEL: string = 'deepseek-chat';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ModelCapabilities = {
	vision?: boolean;
	imageGeneration?: boolean;
	reasoning?: boolean;
	toolUse?: boolean;
	jsonMode?: boolean;
};

export type ModelRequestPreset = {
	/**
	 * Forwarded to `streamText()` as provider-specific options.
	 * Example:
	 * { openrouter: { reasoning: { enabled: true } } }
	 */
	providerOptions?: Record<string, { [key: string]: JsonValue }>;
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
		id: 'qwen-3.6-plus-preview-free',
		name: 'Qwen 3.6 Plus Preview',
		description: 'Qwen 3.6 Plus Preview via OpenRouter, free tier',
		provider: 'openrouter',
		model: 'qwen/qwen3.6-plus-preview:free',
		capabilities: {
			toolUse: true,
			reasoning: true
		}
	},
	{
		id: 'stepfun-step-3.5-flash-free',
		name: 'STEP 3.5 Flash',
		description: 'STEP 3.5 Flash via OpenRouter, free tier',
		provider: 'openrouter',
		model: 'stepfun/step-3.5-flash:free',
		capabilities: {
			toolUse: true,
			reasoning: true
		}
	},
	{
		id: 'openrouter-free',
		name: 'OpenRouter Free',
		description: 'OpenRouter free route model',
		provider: 'openrouter',
		model: 'openrouter/free',
		capabilities: {
			toolUse: true,
			reasoning: true,
			vision: true
		},
		requestPreset: {
			providerOptions: {
				openrouter: {
					reasoning: {
						effort: 'none'
					}
				}
			}
		}
	},
	{
		id: 'deepseek-chat',
		name: 'DeepSeek-Chat',
		description: 'DeepSeek general chat model',
		provider: 'deepseek',
		model: 'deepseek-chat',
		capabilities: {}
	},
	{
		id: 'deepseek-reasoner',
		name: 'DeepSeek-Reasoner',
		description: 'DeepSeek reasoning model',
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

export function getModelRequestPreset(modelId: string): ModelRequestPreset | undefined {
	return getModelRegistryItem(modelId)?.requestPreset;
}
