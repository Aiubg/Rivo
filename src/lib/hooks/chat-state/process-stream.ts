import type { MessagePart, UIMessageWithTree } from '$lib/types/message';
import {
	readStoredRunCursor,
	persistStoredRunCursor,
	shouldTriggerCommitFromRecordType
} from '$lib/hooks/chat-state/run-stream';
import { drainSseFrames, parseSseFrame } from '$lib/utils/sse';

type ChatStreamRecord = {
	type?: string;
	providerMetadata?: {
		openrouter?: {
			reasoning_details?: Array<{ text?: string }>;
		};
	};
	delta?: string;
	reasoningDelta?: string;
	reasoning?: string;
	text?: string;
	toolCallId?: string;
	toolName?: string;
	inputTextDelta?: string;
	input?: unknown;
	output?: unknown;
	errorText?: string;
};

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
	let sawFinish = false;
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

	const currentParts = getLatestParts(options.getMessages(), options.assistantMessageId);
	const lastTextPart = [...currentParts].reverse().find((part) => part.type === 'text') as
		| { type: 'text'; text?: string }
		| undefined;
	const lastReasoningPart = [...currentParts]
		.reverse()
		.find((part) => part.type === 'reasoning') as { type: 'reasoning'; text?: string } | undefined;

	let currentText = typeof lastTextPart?.text === 'string' ? lastTextPart.text : '';
	let currentReasoning = typeof lastReasoningPart?.text === 'string' ? lastReasoningPart.text : '';

	const flushAssistantUpdate = () => {
		options.updateAssistantParts(options.assistantMessageId, [...currentParts]);
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

		let record: ChatStreamRecord;
		try {
			record = JSON.parse(parsedFrame.data) as ChatStreamRecord;
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

		if (record.providerMetadata?.openrouter?.reasoning_details) {
			const details = record.providerMetadata.openrouter.reasoning_details;
			if (Array.isArray(details)) {
				const reasoningText = details.map((detail) => detail.text || '').join('');
				if (reasoningText && reasoningText.length > currentReasoning.length) {
					let lastPart = currentParts[currentParts.length - 1];
					if (lastPart?.type !== 'reasoning') {
						lastPart = { type: 'reasoning', text: '' };
						currentParts.push(lastPart);
					}
					const delta = reasoningText.slice(currentReasoning.length);
					currentReasoning = reasoningText;
					lastPart.text += delta;
					scheduleFlush();
				}
			}
		}

		if (type === 'reasoning-start') {
			currentReasoning = '';
			const lastPart = currentParts[currentParts.length - 1];
			if (lastPart?.type !== 'reasoning') {
				currentParts.push({ type: 'reasoning', text: '' });
			}
		} else if (type === 'reasoning-delta') {
			const delta = record.delta || record.reasoningDelta || record.reasoning || '';
			if (delta) {
				currentReasoning += delta;
				let lastPart = currentParts[currentParts.length - 1];
				if (lastPart?.type !== 'reasoning') {
					lastPart = { type: 'reasoning', text: '' };
					currentParts.push(lastPart);
				}
				lastPart.text += delta;
				scheduleFlush();
			}
		} else if (type === 'text-start') {
			currentText = '';
			currentParts.push({ type: 'text', text: '' });
			flushAssistantUpdate();
		} else if (type === 'text-delta') {
			const delta = record.delta || '';
			if (delta) {
				currentText += delta;
				let lastPart = currentParts[currentParts.length - 1];
				if (lastPart?.type !== 'text') {
					lastPart = { type: 'text', text: '' };
					currentParts.push(lastPart);
				}
				lastPart.text += delta;
				scheduleFlush();
			}
		} else if (type === 'text-end') {
			const finalText = record.text || record.delta || '';
			if (finalText) {
				currentText = finalText;
				const lastPart = currentParts[currentParts.length - 1];
				if (lastPart?.type === 'text') {
					lastPart.text = currentText;
				}
				flushAssistantUpdate();
			}
		} else if (type === 'tool-input-start') {
			if (record.toolCallId) {
				currentParts.push({
					type: 'tool-invocation',
					toolInvocation: {
						toolCallId: record.toolCallId,
						toolName: record.toolName ?? '',
						args: {},
						state: 'call'
					}
				});
				scheduleFlush();
			}
		} else if (type === 'tool-input-delta') {
			const invocationPart = currentParts.find(
				(part) =>
					part.type === 'tool-invocation' && part.toolInvocation?.toolCallId === record.toolCallId
			);
			if (invocationPart?.toolInvocation) {
				const delta = typeof record.inputTextDelta === 'string' ? record.inputTextDelta : '';
				if (!delta) return;
				if (typeof invocationPart.toolInvocation.args !== 'string') {
					invocationPart.toolInvocation.args = delta;
				} else {
					invocationPart.toolInvocation.args += delta;
				}
				scheduleFlush();
			}
		} else if (type === 'tool-input-available') {
			const invocationPart = currentParts.find(
				(part) =>
					part.type === 'tool-invocation' && part.toolInvocation?.toolCallId === record.toolCallId
			);
			if (invocationPart?.toolInvocation) {
				invocationPart.toolInvocation.args = record.input;
				scheduleFlush();
			}
		} else if (type === 'tool-output-available') {
			const invocationPart = currentParts.find(
				(part) =>
					part.type === 'tool-invocation' && part.toolInvocation?.toolCallId === record.toolCallId
			);
			if (invocationPart?.toolInvocation) {
				invocationPart.toolInvocation.state = 'result';
				invocationPart.toolInvocation.result = record.output;
				scheduleFlush();
			}
		} else if (type === 'error') {
			const errorKey =
				typeof record.errorText === 'string' && record.errorText.length > 0
					? record.errorText
					: 'run.failed';
			options.onError?.(errorKey);
			sawFinish = true;
			shouldStopReading = true;
			if (options.activeRunId) {
				options.clearRunRecoveryState(options.activeRunId);
			}
		} else if (type === 'finish') {
			sawFinish = true;
			shouldStopReading = true;
			if (options.activeRunId) {
				options.clearRunRecoveryState(options.activeRunId);
			}
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

		if (!sawFinish && !options.abortSignal?.aborted) {
			throw new Error(options.activeRunId ? 'run.stream_failed' : 'common.request_failed');
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
		if (sawFinish) {
			await options.onFinish?.();
		}
	}
}
