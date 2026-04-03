import { describe, expect, it, vi } from 'vitest';
import { processChatStream } from '$lib/hooks/chat-state/process-stream';

function createStreamBody(...chunks: string[]) {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		}
	});
}

describe('processChatStream', () => {
	it('consumes CRLF SSE frames and flushes a final finish event without a trailing separator', async () => {
		const onFinish = vi.fn();
		const clearRunRecoveryState = vi.fn();
		const updateAssistantParts = vi.fn();

		await processChatStream({
			body: createStreamBody(
				'id: 1\r\ndata: {"type":"text-start"}\r\n\r\n',
				'id: 2\r\ndata: {"type":"text-delta","delta":"Hi"}\r\n\r\n',
				'id: 3\r\ndata: {"type":"text-end","text":"Hi"}\r\n\r\n',
				'id: 4\r\ndata: {"type":"finish"}'
			),
			assistantMessageId: 'assistant-1',
			activeRunId: 'run-1',
			getMessages: () => [{ id: 'assistant-1', role: 'assistant', parts: [] }],
			updateAssistantParts,
			onFinish,
			clearRunRecoveryState
		});

		expect(updateAssistantParts).toHaveBeenCalledWith('assistant-1', [
			{ type: 'text', text: 'Hi' }
		]);
		expect(clearRunRecoveryState).toHaveBeenCalledWith('run-1');
		expect(onFinish).toHaveBeenCalledTimes(1);
	});

	it('throws a retriable error when the stream ends without a terminal event', async () => {
		const onFinish = vi.fn();

		await expect(
			processChatStream({
				body: createStreamBody(
					'id: 1\ndata: {"type":"text-start"}\n\n',
					'id: 2\ndata: {"type":"text-end","text":"partial"}'
				),
				assistantMessageId: 'assistant-2',
				activeRunId: 'run-2',
				getMessages: () => [{ id: 'assistant-2', role: 'assistant', parts: [] }],
				updateAssistantParts: vi.fn(),
				onFinish,
				clearRunRecoveryState: vi.fn()
			})
		).rejects.toThrow('run.stream_failed');

		expect(onFinish).not.toHaveBeenCalled();
	});

	it('does not duplicate reasoning when a frame contains both snapshot metadata and delta', async () => {
		const updateAssistantParts = vi.fn();

		await processChatStream({
			body: createStreamBody(
				'id: 1\ndata: {"type":"reasoning-start"}\n\n',
				'id: 2\ndata: {"type":"reasoning-delta","delta":"User","providerMetadata":{"openrouter":{"reasoning_details":[{"text":"User"}]}}}\n\n',
				'id: 3\ndata: {"type":"reasoning-delta","delta":" asks why","providerMetadata":{"openrouter":{"reasoning_details":[{"text":"User asks why"}]}}}\n\n',
				'id: 4\ndata: {"type":"finish"}'
			),
			assistantMessageId: 'assistant-3',
			activeRunId: 'run-3',
			getMessages: () => [{ id: 'assistant-3', role: 'assistant', parts: [] }],
			updateAssistantParts,
			clearRunRecoveryState: vi.fn()
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(updateAssistantParts).toHaveBeenLastCalledWith('assistant-3', [
			{ type: 'reasoning', text: 'User asks why' }
		]);
	});

	it('keeps full reasoning when OpenRouter metadata contains only the current fragment', async () => {
		const updateAssistantParts = vi.fn();

		await processChatStream({
			body: createStreamBody(
				'id: 1\ndata: {"type":"reasoning-start","providerMetadata":{"openrouter":{"reasoning_details":[{"text":"User"}]}}}\n\n',
				'id: 2\ndata: {"type":"reasoning-delta","delta":"User","providerMetadata":{"openrouter":{"reasoning_details":[{"text":"User"}]}}}\n\n',
				'id: 3\ndata: {"type":"reasoning-delta","delta":" asks","providerMetadata":{"openrouter":{"reasoning_details":[{"text":" asks"}]}}}\n\n',
				'id: 4\ndata: {"type":"reasoning-delta","delta":" politely","providerMetadata":{"openrouter":{"reasoning_details":[{"text":" politely"}]}}}\n\n',
				'id: 5\ndata: {"type":"finish"}'
			),
			assistantMessageId: 'assistant-4',
			activeRunId: 'run-4',
			getMessages: () => [{ id: 'assistant-4', role: 'assistant', parts: [] }],
			updateAssistantParts,
			clearRunRecoveryState: vi.fn()
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(updateAssistantParts).toHaveBeenLastCalledWith('assistant-4', [
			{ type: 'reasoning', text: 'User asks politely' }
		]);
	});
});
