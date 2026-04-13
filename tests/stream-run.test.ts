import { beforeEach, describe, expect, it, vi } from 'vitest';
import { streamRunWithRetry } from '$lib/hooks/chat-state/stream-run';

const { connectRunStreamWithRetry, readStoredRunCursor } = vi.hoisted(() => ({
	connectRunStreamWithRetry: vi.fn(),
	readStoredRunCursor: vi.fn((_: string, fallback: number) => fallback + 7)
}));

vi.mock('$lib/hooks/chat-state/connect-run-stream', () => ({
	connectRunStreamWithRetry
}));

vi.mock('$lib/hooks/chat-state/run-stream', () => ({
	readStoredRunCursor
}));

describe('streamRunWithRetry', () => {
	beforeEach(() => {
		connectRunStreamWithRetry.mockReset();
		readStoredRunCursor.mockClear();
		globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch;
	});

	it('delegates run stream retries with the standard fetch and cursor wiring', async () => {
		connectRunStreamWithRetry.mockImplementationOnce(async (options: any) => {
			expect(options.initialCursor).toBe(3);
			expect(options.readCursor(5)).toBe(12);
			expect(await options.fetchStream(9, new AbortController().signal)).toBeInstanceOf(Response);
			await options.processStream(new ReadableStream());
		});

		const processStream = vi.fn(async () => {});

		await streamRunWithRetry({
			runId: 'run-1',
			assistantMessageId: 'assistant-1',
			initialCursor: 3,
			outerAbortSignal: new AbortController().signal,
			processStream
		});

		expect(connectRunStreamWithRetry).toHaveBeenCalledTimes(1);
		expect(processStream).toHaveBeenCalledWith(
			expect.any(ReadableStream),
			'assistant-1',
			undefined,
			expect.any(Function)
		);
		expect(globalThis.fetch).toHaveBeenCalledWith('/api/runs/run-1/stream?cursor=9', {
			signal: expect.any(AbortSignal)
		});
	});

	it('rethrows normalized process stream errors so retry logic can handle them', async () => {
		connectRunStreamWithRetry.mockImplementationOnce(async (options: any) => {
			await options.processStream(new ReadableStream());
		});

		const processStream = vi.fn(
			async (
				_body: ReadableStream<Uint8Array>,
				_assistantMessageId: string,
				_onFirstRecord?: () => void,
				onError?: (errorKey: string) => void
			) => {
				onError?.('run.stream_failed');
			}
		);

		await expect(
			streamRunWithRetry({
				runId: 'run-2',
				assistantMessageId: 'assistant-2',
				initialCursor: 0,
				outerAbortSignal: new AbortController().signal,
				processStream
			})
		).rejects.toThrow('run.stream_failed');
	});
});
