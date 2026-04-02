import { combineAbortSignals } from '$lib/utils/network';
import {
	getStreamReconnectDelay,
	readStreamErrorMessage,
	STREAM_CONNECT_MAX_ATTEMPTS,
	STREAM_CONNECT_TIMEOUT_MS
} from '$lib/hooks/chat-state/run-stream';

type ConnectRunStreamOptions = {
	initialCursor: number;
	outerAbortSignal: AbortSignal;
	fetchStream: (cursor: number, signal: AbortSignal) => Promise<Response>;
	processStream: (body: ReadableStream<Uint8Array>) => Promise<void>;
	readCursor: (fallback: number) => number;
	shouldRetry: (error: unknown) => boolean;
};

export async function connectRunStreamWithRetry(options: ConnectRunStreamOptions): Promise<void> {
	let streamCursor = options.initialCursor;
	let lastError: unknown = null;

	for (let attempt = 0; attempt < STREAM_CONNECT_MAX_ATTEMPTS; attempt++) {
		const streamController = new AbortController();
		const connectTimeoutId = setTimeout(() => streamController.abort(), STREAM_CONNECT_TIMEOUT_MS);
		const signal =
			combineAbortSignals(options.outerAbortSignal, streamController.signal) ??
			streamController.signal;

		try {
			const response = await options.fetchStream(streamCursor, signal);
			if (!response.ok || !response.body) {
				throw new Error(await readStreamErrorMessage(response));
			}

			clearTimeout(connectTimeoutId);
			await options.processStream(response.body);
			lastError = null;
			break;
		} catch (error) {
			clearTimeout(connectTimeoutId);
			lastError = error;

			const externalAborted =
				error instanceof DOMException &&
				error.name === 'AbortError' &&
				options.outerAbortSignal.aborted;
			if (externalAborted) {
				throw error;
			}

			if (attempt < STREAM_CONNECT_MAX_ATTEMPTS - 1 && options.shouldRetry(error)) {
				await new Promise((resolve) => setTimeout(resolve, getStreamReconnectDelay(attempt)));
				const localCursor = options.readCursor(streamCursor);
				if (localCursor > streamCursor) {
					streamCursor = localCursor;
				}
				continue;
			}
		}
	}

	if (lastError) {
		throw lastError;
	}
}
