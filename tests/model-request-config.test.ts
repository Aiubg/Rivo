import { describe, expect, it } from 'vitest';
import {
	getModelRegistryItem,
	modelSupportsThinkingMode,
	resolveModelRequestConfig
} from '$lib/ai/model-registry';
import { ChatRequestSchema } from '$lib/utils/zod';

describe('model request config', () => {
	it('looks up model registry entries by id', () => {
		expect(getModelRegistryItem('deepseek-chat')?.provider).toBe('deepseek');
		expect(getModelRegistryItem('unknown-model')).toBeUndefined();
	});

	it('maps DeepSeek V4 Flash thinking mode to provider options', () => {
		expect(modelSupportsThinkingMode('deepseek-v4-flash')).toBe(true);

		expect(
			resolveModelRequestConfig({
				modelId: 'deepseek-v4-flash',
				modelOptions: { thinking: { mode: 'enabled' } }
			})
		).toMatchObject({
			modelOptions: { thinking: { mode: 'enabled' } },
			providerOptions: {
				deepseek: {
					thinking: { type: 'enabled' }
				}
			}
		});

		expect(
			resolveModelRequestConfig({
				modelId: 'deepseek-v4-flash',
				modelOptions: { thinking: { mode: 'disabled' } }
			})
		).toMatchObject({
			modelOptions: { thinking: { mode: 'disabled' } },
			providerOptions: {
				deepseek: {
					thinking: { type: 'disabled' }
				}
			}
		});
	});

	it('applies the model default and ignores unsupported thinking options', () => {
		expect(resolveModelRequestConfig({ modelId: 'deepseek-v4-flash' })).toMatchObject({
			modelOptions: { thinking: { mode: 'disabled' } },
			providerOptions: {
				deepseek: {
					thinking: { type: 'disabled' }
				}
			}
		});

		expect(
			resolveModelRequestConfig({
				modelId: 'deepseek-chat',
				modelOptions: { thinking: { mode: 'enabled' } }
			})
		).toEqual({ modelOptions: {} });
	});

	it('accepts thinking mode in chat request bodies', () => {
		const parsed = ChatRequestSchema.parse({
			id: 'chat-1',
			modelOptions: {
				thinking: { mode: 'enabled' }
			},
			messages: [
				{
					id: 'message-1',
					role: 'user',
					parts: [{ type: 'text', text: 'hello' }]
				}
			]
		});

		expect(parsed.modelOptions).toEqual({ thinking: { mode: 'enabled' } });
	});
});
