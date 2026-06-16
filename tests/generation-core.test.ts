import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	streamText: vi.fn(),
	stepCountIs: vi.fn((count: number) => ({ maxSteps: count })),
	resolveModelRequestConfig: vi.fn(),
	languageModel: vi.fn((modelId: string) => ({ modelId })),
	systemPrompt: vi.fn(() => 'resolved system prompt'),
	convertToCoreMessagesWithResolvedImages: vi.fn(),
	selectTools: vi.fn(),
	buildToolContext: vi.fn((ctx: unknown) => ({ ctx })),
	toAiTools: vi.fn()
}));

vi.mock('ai', () => ({
	streamText: mocks.streamText,
	stepCountIs: mocks.stepCountIs
}));

vi.mock('$lib/ai/model-registry', () => ({
	resolveModelRequestConfig: mocks.resolveModelRequestConfig
}));

vi.mock('$lib/server/ai/models', () => ({
	myProvider: {
		languageModel: mocks.languageModel
	}
}));

vi.mock('$lib/server/ai/prompts', () => ({
	systemPrompt: mocks.systemPrompt
}));

vi.mock('$lib/server/ai/utils', () => ({
	convertToCoreMessagesWithResolvedImages: mocks.convertToCoreMessagesWithResolvedImages
}));

vi.mock('$lib/server/ai/tools/selection', () => ({
	selectTools: mocks.selectTools,
	buildToolContext: mocks.buildToolContext
}));

vi.mock('$lib/server/ai/tools/ai-adapter', () => ({
	toAiTools: mocks.toAiTools
}));

import { executeGenerationCore } from '$lib/server/ai/generation-core';

describe('executeGenerationCore', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.convertToCoreMessagesWithResolvedImages.mockResolvedValue([
			{ role: 'user', content: [{ type: 'text', text: 'hello' }] }
		]);
		mocks.resolveModelRequestConfig.mockReturnValue({ modelOptions: {} });
		mocks.selectTools.mockReturnValue([]);
		mocks.toAiTools.mockReturnValue({});
		mocks.streamText.mockReturnValue({ streamId: 'result' });
	});

	it('builds the shared streamText request from model, prompt, messages, and abort signal', async () => {
		const abortController = new AbortController();
		const messages = [
			{
				id: 'user-1',
				role: 'user',
				parts: [{ type: 'text', text: 'hello' }]
			}
		] as never;

		const result = await executeGenerationCore({
			selectedChatModel: 'model-1',
			messages,
			chatId: 'chat-1',
			userId: 'user-1',
			personalization: { tone: 'warm' },
			context: {
				nowIso: '2026-06-16T00:00:00.000Z',
				timeZone: 'Asia/Shanghai',
				locale: 'zh-CN',
				url: 'http://localhost/chat'
			},
			abortSignal: abortController.signal
		});

		expect(result).toEqual({ streamId: 'result' });
		expect(mocks.convertToCoreMessagesWithResolvedImages).toHaveBeenCalledWith(messages);
		expect(mocks.languageModel).toHaveBeenCalledWith('model-1');
		expect(mocks.systemPrompt).toHaveBeenCalledWith({
			selectedChatModel: 'model-1',
			personalization: { tone: 'warm' },
			context: {
				nowIso: '2026-06-16T00:00:00.000Z',
				timeZone: 'Asia/Shanghai',
				locale: 'zh-CN',
				url: 'http://localhost/chat'
			}
		});
		expect(mocks.streamText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: { modelId: 'model-1' },
				system: 'resolved system prompt',
				messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
				abortSignal: abortController.signal
			})
		);
		expect(mocks.toAiTools).not.toHaveBeenCalled();
	});

	it('applies selected tools and provider options when available', async () => {
		const toolRecord = { definition: { name: 'calculator' } };
		const aiTools = { calculator: { execute: vi.fn() } };
		const providerOptions = {
			deepseek: {
				thinking: { type: 'enabled' }
			}
		};

		mocks.selectTools.mockReturnValue([toolRecord]);
		mocks.toAiTools.mockReturnValue(aiTools);
		mocks.resolveModelRequestConfig.mockReturnValue({
			modelOptions: { thinking: { mode: 'enabled' } },
			providerOptions
		});

		await executeGenerationCore({
			selectedChatModel: 'deepseek-v4-flash',
			messages: [] as never,
			chatId: 'chat-2',
			userId: 'user-2',
			modelOptions: { thinking: { mode: 'enabled' } }
		});

		expect(mocks.selectTools).toHaveBeenCalledWith(
			expect.objectContaining({
				modelId: 'deepseek-v4-flash',
				chatId: 'chat-2',
				userId: 'user-2',
				allocateSearchResultId: expect.any(Function)
			})
		);
		expect(mocks.toAiTools).toHaveBeenCalledTimes(1);
		expect(mocks.streamText).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: aiTools,
				stopWhen: { maxSteps: 30 },
				providerOptions
			})
		);
	});
});
