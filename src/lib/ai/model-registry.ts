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
		id: 'deepseek-chat',
		name: 'DeepSeek-Chat',
		description: 'Balanced chat model for writing, coding, and tool use',
		provider: 'deepseek',
		model: 'deepseek-chat',
		capabilities: {}
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

export function getModelRequestPreset(modelId: string): ModelRequestPreset | undefined {
	return getModelRegistryItem(modelId)?.requestPreset;
}
