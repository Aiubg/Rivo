import type { MessagePart } from '$lib/types/message';
import { drainSseFrames, parseSseFrame } from '$lib/utils/sse';

type OpenRouterReasoningDetail = { text?: string };

export type UIMessageStreamRecord = {
	type?: string;
	providerMetadata?: {
		openrouter?: {
			reasoning_details?: OpenRouterReasoningDetail[];
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
	file?: unknown;
};

export type GenerationFailureKind = 'retryable' | 'permanent' | 'unknown';

export type GenerationOutcomeState =
	| 'success'
	| 'partial_success'
	| 'failed_retryable'
	| 'failed_permanent'
	| 'empty_invalid'
	| 'canceled';

export type GenerationStreamOutcome = {
	state: GenerationOutcomeState;
	parts: MessagePart[];
	errorKey: string | null;
	hasVisibleOutput: boolean;
	sawError: boolean;
	sawFinish: boolean;
};

function cloneToolInvocation(part: MessagePart): MessagePart {
	if (!part.toolInvocation) {
		return { ...part };
	}

	return {
		...part,
		toolInvocation: {
			...part.toolInvocation
		}
	};
}

export function cloneMessageParts(parts: ReadonlyArray<MessagePart>): MessagePart[] {
	return parts.map((part) => cloneToolInvocation(part));
}

export function hasVisibleMessageParts(
	parts: ReadonlyArray<MessagePart> | undefined | null
): boolean {
	if (!Array.isArray(parts)) {
		return false;
	}

	return parts.some((part) => {
		if (part.type === 'text') {
			return typeof part.text === 'string' && part.text.trim().length > 0;
		}

		if (part.type === 'tool-invocation') {
			return part.toolInvocation?.state === 'result';
		}

		if (part.type === 'dynamic-tool') {
			return part.output !== undefined;
		}

		return part.type === 'file';
	});
}

export function classifyGenerationFailureKind(
	errorText: string | null | undefined
): GenerationFailureKind {
	if (!errorText) {
		return 'unknown';
	}

	const normalized = errorText.toLowerCase();

	if (
		normalized.includes('429') ||
		normalized.includes('rate limit') ||
		normalized.includes('rate-limit') ||
		normalized.includes('rate limited') ||
		normalized.includes('retry shortly') ||
		normalized.includes('temporarily') ||
		normalized.includes('timeout') ||
		normalized.includes('timed out') ||
		normalized.includes('overloaded') ||
		normalized.includes('unavailable') ||
		normalized.includes('try again later') ||
		normalized.includes('network') ||
		normalized.includes('connection') ||
		normalized.includes('stream_failed')
	) {
		return 'retryable';
	}

	if (
		normalized.includes('missing api key') ||
		normalized.includes('unauthorized') ||
		normalized.includes('forbidden') ||
		normalized.includes('invalid') ||
		normalized.includes('does not support') ||
		normalized.includes('not supported') ||
		normalized.includes('unsupported') ||
		normalized.includes('vision_not_supported')
	) {
		return 'permanent';
	}

	return 'unknown';
}

function getReasoningDelta(record: UIMessageStreamRecord): string {
	if (typeof record.delta === 'string' && record.delta.length > 0) {
		return record.delta;
	}
	if (typeof record.reasoningDelta === 'string' && record.reasoningDelta.length > 0) {
		return record.reasoningDelta;
	}
	if (typeof record.reasoning === 'string' && record.reasoning.length > 0) {
		return record.reasoning;
	}
	return '';
}

function getReasoningSnapshot(record: UIMessageStreamRecord): string {
	const details = record.providerMetadata?.openrouter?.reasoning_details;
	if (!Array.isArray(details)) {
		return '';
	}

	return details.map((detail) => detail.text || '').join('');
}

export class UIMessageStreamSupervisor {
	private readonly parts: MessagePart[];
	private currentReasoning = '';
	private currentText = '';
	private hasVisibleOutput = false;
	private sawError = false;
	private sawFinish = false;
	private sawAbort = false;
	private errorKey: string | null = null;

	constructor(initialParts: ReadonlyArray<MessagePart> = []) {
		this.parts = cloneMessageParts(initialParts);
		this.hasVisibleOutput = hasVisibleMessageParts(initialParts);
		const lastTextPart = [...initialParts]
			.reverse()
			.find((part) => part.type === 'text' && typeof part.text === 'string');
		const lastReasoningPart = [...initialParts]
			.reverse()
			.find((part) => part.type === 'reasoning' && typeof part.text === 'string');

		this.currentText = typeof lastTextPart?.text === 'string' ? lastTextPart.text : '';
		this.currentReasoning =
			typeof lastReasoningPart?.text === 'string' ? lastReasoningPart.text : '';
	}

	getParts(): MessagePart[] {
		return cloneMessageParts(this.parts);
	}

	ingestRecord(record: UIMessageStreamRecord): { partsChanged: boolean } {
		const type = record.type;
		let partsChanged = false;

		const ensureReasoningPart = () => {
			let lastPart = this.parts[this.parts.length - 1];
			if (lastPart?.type !== 'reasoning') {
				lastPart = { type: 'reasoning', text: '' };
				this.parts.push(lastPart);
				partsChanged = true;
			}
			return lastPart;
		};

		if (type === 'reasoning-start') {
			this.currentReasoning = '';
			ensureReasoningPart();
		}

		const reasoningDelta = getReasoningDelta(record);
		const reasoningSnapshot = getReasoningSnapshot(record);
		if (type === 'reasoning-delta' && reasoningDelta) {
			this.currentReasoning += reasoningDelta;
			const lastPart = ensureReasoningPart();
			lastPart.text = `${lastPart.text ?? ''}${reasoningDelta}`;
			partsChanged = true;
		} else if (reasoningSnapshot && type !== 'reasoning-start') {
			const lastPart = ensureReasoningPart();
			if (reasoningSnapshot !== this.currentReasoning) {
				if (
					this.currentReasoning.length > 0 &&
					reasoningSnapshot.startsWith(this.currentReasoning)
				) {
					lastPart.text = `${lastPart.text ?? ''}${reasoningSnapshot.slice(this.currentReasoning.length)}`;
					this.currentReasoning = reasoningSnapshot;
				} else if (type === 'reasoning-delta') {
					lastPart.text = `${lastPart.text ?? ''}${reasoningSnapshot}`;
					this.currentReasoning += reasoningSnapshot;
				} else {
					lastPart.text = reasoningSnapshot;
					this.currentReasoning = reasoningSnapshot;
				}
				partsChanged = true;
			}
		}

		if (!type) {
			return { partsChanged };
		}

		if (type === 'text-start') {
			this.currentText = '';
			const last = this.parts.at(-1);
			if (!last || last.type !== 'text') {
				this.parts.push({ type: 'text', text: '' });
				partsChanged = true;
			}
		} else if (type === 'text-delta') {
			const delta = typeof record.delta === 'string' ? record.delta : '';
			if (delta) {
				this.currentText += delta;
				let lastPart = this.parts[this.parts.length - 1];
				if (!lastPart || lastPart.type !== 'text') {
					lastPart = { type: 'text', text: '' };
					this.parts.push(lastPart);
				}
				lastPart.text = `${lastPart.text ?? ''}${delta}`;
				this.hasVisibleOutput = true;
				partsChanged = true;
			}
		} else if (type === 'text-end') {
			const finalText =
				typeof record.text === 'string'
					? record.text
					: typeof record.delta === 'string'
						? record.delta
						: '';
			if (finalText) {
				this.currentText = finalText;
				const lastPart = this.parts[this.parts.length - 1];
				if (lastPart?.type === 'text') {
					lastPart.text = this.currentText;
				} else {
					this.parts.push({ type: 'text', text: this.currentText });
				}
				this.hasVisibleOutput = true;
				partsChanged = true;
			}
		} else if (type === 'tool-input-start') {
			if (record.toolCallId) {
				this.parts.push({
					type: 'tool-invocation',
					toolInvocation: {
						toolCallId: record.toolCallId,
						toolName: record.toolName ?? '',
						args: {},
						state: 'call'
					}
				});
				partsChanged = true;
			}
		} else if (type === 'tool-input-delta') {
			const invocationPart = this.parts.find(
				(part) =>
					part.type === 'tool-invocation' && part.toolInvocation?.toolCallId === record.toolCallId
			);
			if (invocationPart?.toolInvocation) {
				const delta = typeof record.inputTextDelta === 'string' ? record.inputTextDelta : '';
				if (delta) {
					if (typeof invocationPart.toolInvocation.args !== 'string') {
						invocationPart.toolInvocation.args = delta;
					} else {
						invocationPart.toolInvocation.args += delta;
					}
					partsChanged = true;
				}
			}
		} else if (type === 'tool-input-available') {
			const invocationPart = this.parts.find(
				(part) =>
					part.type === 'tool-invocation' && part.toolInvocation?.toolCallId === record.toolCallId
			);
			if (invocationPart?.toolInvocation) {
				invocationPart.toolInvocation.args = record.input;
				partsChanged = true;
			}
		} else if (type === 'tool-output-available') {
			const invocationPart = this.parts.find(
				(part) =>
					part.type === 'tool-invocation' && part.toolInvocation?.toolCallId === record.toolCallId
			);
			if (invocationPart?.toolInvocation) {
				invocationPart.toolInvocation.state = 'result';
				invocationPart.toolInvocation.result = record.output;
				this.hasVisibleOutput = true;
				partsChanged = true;
			}
		} else if (type === 'file') {
			this.hasVisibleOutput = true;
		} else if (type === 'error') {
			this.sawError = true;
			this.errorKey =
				typeof record.errorText === 'string' && record.errorText.length > 0
					? record.errorText
					: 'run.failed';
		} else if (type === 'abort') {
			this.sawAbort = true;
			this.errorKey = 'run.canceled';
		} else if (type === 'finish') {
			this.sawFinish = true;
		}

		return { partsChanged };
	}

	ingestChunkJson(chunk: string): { partsChanged: boolean } {
		let parsed: UIMessageStreamRecord;
		try {
			parsed = JSON.parse(chunk) as UIMessageStreamRecord;
		} catch {
			return { partsChanged: false };
		}

		return this.ingestRecord(parsed);
	}

	ingestFrame(frame: string): { partsChanged: boolean } {
		const parsedFrame = parseSseFrame(frame);
		if (!parsedFrame?.data) {
			return { partsChanged: false };
		}

		return this.ingestChunkJson(parsedFrame.data);
	}

	getOutcome(): GenerationStreamOutcome {
		if (this.sawAbort) {
			return {
				state: 'canceled',
				parts: this.getParts(),
				errorKey: this.errorKey ?? 'run.canceled',
				hasVisibleOutput: this.hasVisibleOutput,
				sawError: this.sawError,
				sawFinish: this.sawFinish
			};
		}

		if (this.sawError) {
			return {
				state: this.hasVisibleOutput
					? 'partial_success'
					: classifyGenerationFailureKind(this.errorKey) === 'permanent'
						? 'failed_permanent'
						: 'failed_retryable',
				parts: this.getParts(),
				errorKey: this.errorKey ?? 'run.failed',
				hasVisibleOutput: this.hasVisibleOutput,
				sawError: this.sawError,
				sawFinish: this.sawFinish
			};
		}

		if (this.sawFinish) {
			return {
				state: this.hasVisibleOutput ? 'success' : 'empty_invalid',
				parts: this.getParts(),
				errorKey: this.hasVisibleOutput ? null : 'run.empty_output_invalid',
				hasVisibleOutput: this.hasVisibleOutput,
				sawError: this.sawError,
				sawFinish: this.sawFinish
			};
		}

		return {
			state: this.hasVisibleOutput ? 'partial_success' : 'failed_retryable',
			parts: this.getParts(),
			errorKey: this.errorKey ?? 'run.stream_failed',
			hasVisibleOutput: this.hasVisibleOutput,
			sawError: this.sawError,
			sawFinish: this.sawFinish
		};
	}
}

export async function consumeUIMessageStream(options: {
	body: ReadableStream<Uint8Array>;
	initialParts?: ReadonlyArray<MessagePart>;
	onFrame?: (frame: string) => Promise<void> | void;
}): Promise<GenerationStreamOutcome> {
	const reader = options.body.getReader();
	const decoder = new TextDecoder();
	const supervisor = new UIMessageStreamSupervisor(options.initialParts);
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				buffer += decoder.decode();
			} else {
				buffer += decoder.decode(value, { stream: true });
			}

			const drained = drainSseFrames(buffer);
			buffer = drained.remaining;

			for (const frame of drained.frames) {
				supervisor.ingestFrame(frame);
				await options.onFrame?.(frame);
			}

			if (done) {
				break;
			}
		}

		if (buffer.trim().length > 0) {
			supervisor.ingestFrame(buffer);
			await options.onFrame?.(buffer);
		}

		return supervisor.getOutcome();
	} finally {
		reader.releaseLock();
	}
}
