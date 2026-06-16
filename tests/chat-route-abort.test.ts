import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	streamText: vi.fn(),
	stepCountIs: vi.fn((count: number) => ({ count })),
	consumeUIMessageStream: vi.fn(),
	upsertMessage: vi.fn(),
	getChatById: vi.fn(),
	getMessageById: vi.fn(),
	saveChat: vi.fn(),
	saveMessages: vi.fn(),
	deleteChatById: vi.fn(),
	convertToCoreMessagesWithResolvedImages: vi.fn(async (messages: unknown) => messages),
	generateTitleFromUserMessage: vi.fn(),
	mapModelProviderErrorToErrorKey: vi.fn(() => null),
	assertValidModelRequest: vi.fn(),
	myProvider: {
		languageModel: vi.fn((modelId: string) => ({ modelId }))
	},
	systemPrompt: vi.fn(() => 'system prompt'),
	resolveModelRequestConfig: vi.fn(() => ({ modelOptions: {} })),
	selectTools: vi.fn(() => []),
	buildToolContext: vi.fn(() => ({})),
	toAiTools: vi.fn(() => ({})),
	getCitationMetrics: vi.fn(() => ({
		sourceCount: 0,
		markerCount: 0,
		fallbackLikely: false
	})),
	logger: {
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	}
}));

vi.mock('$lib/utils/constants', () => ({
	allowAnonymousChats: true
}));

vi.mock('ai', () => ({
	streamText: mocks.streamText,
	stepCountIs: mocks.stepCountIs
}));

vi.mock('$lib/ai/ui-message-stream-supervisor', () => ({
	consumeUIMessageStream: mocks.consumeUIMessageStream
}));

vi.mock('$lib/server/ai/models', () => ({
	myProvider: mocks.myProvider
}));

vi.mock('$lib/server/ai/prompts', () => ({
	systemPrompt: mocks.systemPrompt
}));

vi.mock('$lib/ai/model-registry', () => ({
	resolveModelRequestConfig: mocks.resolveModelRequestConfig
}));

vi.mock('$lib/server/ai/utils', () => ({
	convertToCoreMessagesWithResolvedImages: mocks.convertToCoreMessagesWithResolvedImages,
	generateTitleFromUserMessage: mocks.generateTitleFromUserMessage,
	mapModelProviderErrorToErrorKey: mocks.mapModelProviderErrorToErrorKey,
	assertValidModelRequest: mocks.assertValidModelRequest
}));

vi.mock('$lib/server/db/queries', () => ({
	deleteChatById: mocks.deleteChatById,
	getChatById: mocks.getChatById,
	getMessageById: mocks.getMessageById,
	saveChat: mocks.saveChat,
	saveMessages: mocks.saveMessages,
	upsertMessage: mocks.upsertMessage
}));

vi.mock('$lib/server/ai/tools/selection', () => ({
	selectTools: mocks.selectTools,
	buildToolContext: mocks.buildToolContext
}));

vi.mock('$lib/server/ai/tools/ai-adapter', () => ({
	toAiTools: mocks.toAiTools
}));

vi.mock('$lib/utils/citations', () => ({
	getCitationMetrics: mocks.getCitationMetrics
}));

vi.mock('$lib/utils/logger', () => ({
	logger: mocks.logger
}));

import { POST as chatRoute } from '../src/routes/(chat)/api/chat/+server';

function createUiMessageStreamBody() {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('data: {"type":"text-start"}\n\n'));
			controller.enqueue(
				new TextEncoder().encode('data: {"type":"text-delta","delta":"partial"}\n\n')
			);
			controller.close();
		}
	});
}

function createChatRequest(signal: AbortSignal) {
	return new Request('http://localhost/api/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'accept-language': 'en-US' },
		signal,
		body: JSON.stringify({
			id: 'chat-1',
			assistantMessageId: 'assistant-1',
			messages: [
				{
					id: 'user-1',
					role: 'user',
					content: 'hello',
					parts: [{ type: 'text', text: 'hello' }]
				}
			]
		})
	});
}

describe('/api/chat anonymous abort handling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.streamText.mockReturnValue({
			toUIMessageStreamResponse: vi.fn(
				() =>
					new Response(createUiMessageStreamBody(), {
						headers: { 'content-type': 'text/event-stream' }
					})
			)
		});
	});

	it('returns the direct anonymous stream response through the shared generation core', async () => {
		mocks.consumeUIMessageStream.mockResolvedValueOnce({
			state: 'success',
			parts: [{ type: 'text', text: 'partial' }],
			errorKey: null,
			hasVisibleOutput: true,
			sawError: false,
			sawFinish: true
		});
		const request = createChatRequest(new AbortController().signal);

		const response = await chatRoute({
			request,
			locals: {},
			cookies: {
				get: (name: string) => (name === 'selected-model' ? 'test-model' : undefined)
			},
			url: new URL('http://localhost/api/chat')
		} as never);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/event-stream');
		expect(await response.text()).toContain('"delta":"partial"');
		expect(mocks.streamText).toHaveBeenCalledWith(
			expect.objectContaining({
				abortSignal: request.signal
			})
		);
		expect(mocks.consumeUIMessageStream).toHaveBeenCalledWith(
			expect.objectContaining({
				abortSignal: request.signal
			})
		);
	});

	it.each([
		{
			name: 'partial output',
			parts: [{ type: 'text', text: 'partial' }],
			hasVisibleOutput: true
		},
		{
			name: 'no output',
			parts: [],
			hasVisibleOutput: false
		}
	])(
		'passes the request signal through direct anonymous streaming and skips persistence when canceled with $name',
		async ({ parts, hasVisibleOutput }) => {
			const abortController = new AbortController();
			mocks.consumeUIMessageStream.mockImplementationOnce(async (_options) => {
				abortController.abort();
				return {
					state: 'canceled',
					parts,
					errorKey: 'run.canceled',
					hasVisibleOutput,
					sawError: false,
					sawFinish: false
				};
			});
			const request = createChatRequest(abortController.signal);

			const response = await chatRoute({
				request,
				locals: {},
				cookies: {
					get: (name: string) => (name === 'selected-model' ? 'test-model' : undefined)
				},
				url: new URL('http://localhost/api/chat')
			} as never);

			await Promise.resolve();

			expect(response.status).toBe(200);
			expect(mocks.streamText).toHaveBeenCalledWith(
				expect.objectContaining({
					abortSignal: request.signal
				})
			);
			expect(mocks.consumeUIMessageStream).toHaveBeenCalledWith(
				expect.objectContaining({
					abortSignal: request.signal
				})
			);
			expect(mocks.upsertMessage).not.toHaveBeenCalled();
		}
	);
});
