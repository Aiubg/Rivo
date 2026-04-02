import { describe, expect, it, vi } from 'vitest';
import { connectRunStreamWithRetry } from '$lib/hooks/chat-state/connect-run-stream';

function createStreamBody() {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('data: {"type":"finish"}\n\n'));
			controller.close();
		}
	});
}

describe('connectRunStreamWithRetry', () => {
	it('retries stream failures from the latest stored cursor', async () => {
		vi.useFakeTimers();
		const cursors: number[] = [];
		let attempts = 0;
		const processStream = vi.fn(async () => {});

		const promise = connectRunStreamWithRetry({
			initialCursor: 5,
			outerAbortSignal: new AbortController().signal,
			fetchStream: async (cursor) => {
				cursors.push(cursor);
				if (attempts++ === 0) {
					throw new Error('run.stream_failed');
				}

				return new Response(createStreamBody());
			},
			processStream,
			readCursor: () => 12,
			shouldRetry: (error) => error instanceof Error && error.message === 'run.stream_failed'
		});

		await vi.advanceTimersByTimeAsync(500);
		await promise;
		vi.useRealTimers();

		expect(cursors).toEqual([5, 12]);
		expect(processStream).toHaveBeenCalledTimes(1);
	});

	it('surfaces non-retriable errors immediately', async () => {
		const processStream = vi.fn(async () => {});

		await expect(
			connectRunStreamWithRetry({
				initialCursor: 0,
				outerAbortSignal: new AbortController().signal,
				fetchStream: async () => {
					throw new Error('boom');
				},
				processStream,
				readCursor: () => 0,
				shouldRetry: () => false
			})
		).rejects.toThrow('boom');

		expect(processStream).not.toHaveBeenCalled();
	});
});
