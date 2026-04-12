import type { MessagePart, UIMessageWithTree } from '$lib/types/message';
import {
	UIMessageStreamSupervisor,
	type UIMessageStreamRecord
} from '$lib/ai/ui-message-stream-supervisor';
import {
	readStoredRunCursor,
	persistStoredRunCursor,
	shouldTriggerCommitFromRecordType
} from '$lib/hooks/chat-state/run-stream';
import { drainSseFrames, parseSseFrame } from '$lib/utils/sse';

type ProcessChatStreamOptions = {
	body: ReadableStream<Uint8Array>;
	assistantMessageId: string;
	abortSignal?: AbortSignal | null;
	activeRunId?: string | null;
	getMessages: () => UIMessageWithTree[];
	updateAssistantParts: (assistantMessageId: string, parts: MessagePart[]) => void;
	onFirstRecord?: () => void;
	onError?: (errorKey: string) => void;
	onFinish?: () => Promise<void> | void;
	clearRunRecoveryState: (runId: string) => void;
};

const FLUSH_INTERVAL_MS = 100;

function scheduleAnimationFrame(callback: () => void) {
	if (typeof requestAnimationFrame === 'function') {
		requestAnimationFrame(callback);
		return;
	}

	setTimeout(callback, 0);
}

function getLatestParts(messages: UIMessageWithTree[], assistantMessageId: string): MessagePart[] {
	const existingMessage = messages.find((message) => message.id === assistantMessageId);
	return Array.isArray(existingMessage?.parts) ? [...existingMessage.parts] : [];
}

export async function processChatStream(options: ProcessChatStreamOptions) {
	const reader = options.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let shouldCallOnFinish = false;
	let lastCursorPersistAt = 0;
	let lastPersistedCursor = 0;
	let firstRecordSeen = false;
	let shouldStopReading = false;
	let rafPending = false;
	let lastFlushTime = 0;
	let highestProcessedCursor = 0;

	if (options.activeRunId && typeof window !== 'undefined') {
		highestProcessedCursor = readStoredRunCursor(options.activeRunId, 0);
	}

	const supervisor = new UIMessageStreamSupervisor(
		getLatestParts(options.getMessages(), options.assistantMessageId)
	);

	const flushAssistantUpdate = () => {
		options.updateAssistantParts(options.assistantMessageId, supervisor.getParts());
	};

	const scheduleFlush = (force = false) => {
		const now = Date.now();
		if (force || now - lastFlushTime >= FLUSH_INTERVAL_MS) {
			if (rafPending) return;
			rafPending = true;
			scheduleAnimationFrame(() => {
				flushAssistantUpdate();
				lastFlushTime = Date.now();
				rafPending = false;
			});
			return;
		}

		if (rafPending) return;
		rafPending = true;
		setTimeout(
			() => {
				scheduleAnimationFrame(() => {
					flushAssistantUpdate();
					lastFlushTime = Date.now();
					rafPending = false;
				});
			},
			FLUSH_INTERVAL_MS - (now - lastFlushTime)
		);
	};

	const processFrame = (frame: string) => {
		const parsedFrame = parseSseFrame(frame);
		if (!parsedFrame) {
			return;
		}

		const currentEventId =
			typeof parsedFrame.id === 'string'
				? Number.isFinite(Number(parsedFrame.id))
					? Number(parsedFrame.id)
					: null
				: null;

		let record: UIMessageStreamRecord;
		try {
			record = JSON.parse(parsedFrame.data) as UIMessageStreamRecord;
		} catch {
			return;
		}

		if (
			typeof window !== 'undefined' &&
			options.activeRunId &&
			currentEventId !== null &&
			currentEventId > 0
		) {
			if (currentEventId <= highestProcessedCursor) {
				return;
			}
			highestProcessedCursor = currentEventId;
		}

		const type = record.type;
		const shouldTriggerCommit = shouldTriggerCommitFromRecordType(type);
		if (!firstRecordSeen && shouldTriggerCommit) {
			firstRecordSeen = true;
			options.onFirstRecord?.();
		}

		if (
			typeof window !== 'undefined' &&
			options.activeRunId &&
			currentEventId !== null &&
			currentEventId > 0
		) {
			const now = Date.now();
			if (
				currentEventId > lastPersistedCursor &&
				(now - lastCursorPersistAt >= 250 || currentEventId - lastPersistedCursor >= 25)
			) {
				persistStoredRunCursor(options.activeRunId, currentEventId);
				lastPersistedCursor = currentEventId;
				lastCursorPersistAt = now;
			}
		}

		const { partsChanged } = supervisor.ingestRecord(record);
		if (partsChanged) {
			if (type === 'text-start' || type === 'text-end') {
				flushAssistantUpdate();
			} else {
				scheduleFlush();
			}
		}

		if (type === 'error' || type === 'finish' || type === 'abort') {
			shouldStopReading = true;
		}
	};

	try {
		while (true) {
			if (options.abortSignal?.aborted) {
				await reader.cancel().catch(() => {});
				break;
			}
			const { done, value } = await reader.read();
			if (done) {
				buffer += decoder.decode();
			} else {
				buffer += decoder.decode(value, { stream: true });
			}

			const drained = drainSseFrames(buffer);
			buffer = drained.remaining;

			for (const frame of drained.frames) {
				processFrame(frame);
				if (shouldStopReading) break;
			}

			if (shouldStopReading) {
				await reader.cancel().catch(() => {});
				break;
			}

			if (done) {
				break;
			}
		}

		if (!shouldStopReading && buffer.trim().length > 0) {
			processFrame(buffer);
			buffer = '';
		}

		if (!shouldStopReading && !options.abortSignal?.aborted) {
			throw new Error(options.activeRunId ? 'run.stream_failed' : 'common.request_failed');
		}

		if (!options.abortSignal?.aborted) {
			const outcome = supervisor.getOutcome();
			if (options.activeRunId) {
				options.clearRunRecoveryState(options.activeRunId);
			}

			if (
				outcome.state === 'partial_success' ||
				outcome.state === 'failed_retryable' ||
				outcome.state === 'failed_permanent' ||
				outcome.state === 'empty_invalid'
			) {
				const errorKey = outcome.errorKey ?? 'run.failed';
				options.onError?.(errorKey);
				throw new Error(errorKey);
			}

			if (outcome.state === 'success') {
				shouldCallOnFinish = true;
			}
		}
	} finally {
		reader.releaseLock();
		if (
			typeof window !== 'undefined' &&
			options.activeRunId &&
			highestProcessedCursor > 0 &&
			highestProcessedCursor > lastPersistedCursor
		) {
			persistStoredRunCursor(options.activeRunId, highestProcessedCursor);
		}
		if (shouldCallOnFinish) {
			await options.onFinish?.();
		}
	}
}
