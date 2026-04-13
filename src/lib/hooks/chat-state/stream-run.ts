import { connectRunStreamWithRetry } from '$lib/hooks/chat-state/connect-run-stream';
import { readStoredRunCursor } from '$lib/hooks/chat-state/run-stream';

type StreamRunOptions = {
	runId: string;
	assistantMessageId: string;
	initialCursor: number;
	outerAbortSignal: AbortSignal;
	onFirstRecord?: () => void;
	processStream: (
		body: ReadableStream<Uint8Array>,
		assistantMessageId: string,
		onFirstRecord?: () => void,
		onError?: (errorKey: string) => void
	) => Promise<void>;
};

export async function streamRunWithRetry(options: StreamRunOptions): Promise<void> {
	let streamErrorKey: string | null = null;

	await connectRunStreamWithRetry({
		initialCursor: options.initialCursor,
		outerAbortSignal: options.outerAbortSignal,
		fetchStream: (cursor, signal) =>
			fetch(`/api/runs/${options.runId}/stream?cursor=${cursor}`, { signal }),
		processStream: async (body) => {
			streamErrorKey = null;
			await options.processStream(
				body,
				options.assistantMessageId,
				options.onFirstRecord,
				(errorKey) => {
					streamErrorKey = errorKey;
				}
			);

			if (streamErrorKey) {
				throw new Error(streamErrorKey);
			}
		},
		readCursor: (fallback) => readStoredRunCursor(options.runId, fallback),
		shouldRetry: (error) => error instanceof Error && error.message === 'run.stream_failed'
	});
}
