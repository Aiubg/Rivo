import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processChatStream } from '$lib/hooks/chat-state/process-stream';
import type { UIMessageWithTree } from '$lib/types/message';

function createSseStream(lines: string): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(lines));
			controller.close();
		}
	});
}

describe('processChatStream', () => {
	beforeEach(() => {
		const storage = new Map<string, string>();
		const localStorageMock = {
			getItem: vi.fn((key: string) => storage.get(key) ?? null),
			setItem: vi.fn((key: string, value: string) => {
				storage.set(key, value);
			}),
			removeItem: vi.fn((key: string) => {
				storage.delete(key);
			})
		};

		Object.defineProperty(globalThis, 'window', {
			value: { localStorage: localStorageMock },
			configurable: true
		});
		Object.defineProperty(globalThis, 'localStorage', {
			value: localStorageMock,
			configurable: true
		});
		Object.defineProperty(globalThis, 'requestAnimationFrame', {
			value: (cb: FrameRequestCallback) => {
				cb(0);
				return 0;
			},
			configurable: true
		});
	});

	it('skips replayed events that are older than stored cursor', async () => {
		localStorage.setItem('run_cursor_run-1', '2');
		const assistantMessageId = 'assistant-1';
		const messages: UIMessageWithTree[] = [
			{ id: assistantMessageId, role: 'assistant', parts: [] }
		];

		await processChatStream({
			body: createSseStream(
				[
					'id: 1',
					'data: {"type":"text-start"}',
					'',
					'id: 2',
					'data: {"type":"text-delta","delta":"用户"}',
					'',
					'id: 3',
					'data: {"type":"text-delta","delta":"说了你好"}',
					'',
					'id: 4',
					'data: {"type":"finish"}',
					''
				].join('\n')
			),
			assistantMessageId,
			activeRunId: 'run-1',
			getMessages: () => messages,
			updateAssistantParts: (id, parts) => {
				const index = messages.findIndex((message) => message.id === id);
				if (index >= 0) {
					messages[index] = { ...messages[index], parts };
				}
			},
			clearRunRecoveryState: () => {}
		});

		expect(messages[0]?.parts).toEqual([{ type: 'text', text: '说了你好' }]);
		expect(localStorage.getItem('run_cursor_run-1')).toBe('4');
	});

	it('persists highest processed cursor on stream end', async () => {
		localStorage.setItem('run_cursor_run-2', '0');
		const assistantMessageId = 'assistant-2';
		const messages: UIMessageWithTree[] = [
			{ id: assistantMessageId, role: 'assistant', parts: [] }
		];

		await processChatStream({
			body: createSseStream(
				[
					'id: 1',
					'data: {"type":"text-start"}',
					'',
					'id: 2',
					'data: {"type":"text-delta","delta":"a"}',
					'',
					'id: 30',
					'data: {"type":"finish"}',
					''
				].join('\n')
			),
			assistantMessageId,
			activeRunId: 'run-2',
			getMessages: () => messages,
			updateAssistantParts: (id, parts) => {
				const index = messages.findIndex((message) => message.id === id);
				if (index >= 0) {
					messages[index] = { ...messages[index], parts };
				}
			},
			clearRunRecoveryState: () => {}
		});

		expect(localStorage.getItem('run_cursor_run-2')).toBe('30');
	});
});
