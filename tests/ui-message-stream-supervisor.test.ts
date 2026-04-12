import { describe, expect, it } from 'vitest';
import {
	UIMessageStreamSupervisor,
	classifyGenerationFailureKind,
	hasVisibleMessageParts
} from '$lib/ai/ui-message-stream-supervisor';

describe('UIMessageStreamSupervisor', () => {
	it('classifies upstream rate limits as retryable failures without visible output', () => {
		const supervisor = new UIMessageStreamSupervisor();
		supervisor.ingestChunkJson(
			JSON.stringify({
				type: 'error',
				errorText:
					'[Google AI Studio] google/gemma-4-31b-it:free is temporarily rate-limited upstream. Please retry shortly.'
			})
		);

		expect(supervisor.getOutcome()).toMatchObject({
			state: 'failed_retryable',
			hasVisibleOutput: false
		});
	});

	it('keeps partial output when an error arrives after text', () => {
		const supervisor = new UIMessageStreamSupervisor();
		supervisor.ingestChunkJson(JSON.stringify({ type: 'text-start' }));
		supervisor.ingestChunkJson(JSON.stringify({ type: 'text-delta', delta: 'Hello' }));
		supervisor.ingestChunkJson(JSON.stringify({ type: 'error', errorText: 'run.failed' }));

		expect(supervisor.getOutcome()).toMatchObject({
			state: 'partial_success',
			hasVisibleOutput: true
		});
		expect(hasVisibleMessageParts(supervisor.getParts())).toBe(true);
	});

	it('treats finish without visible output as invalid empty output', () => {
		const supervisor = new UIMessageStreamSupervisor();
		supervisor.ingestChunkJson(JSON.stringify({ type: 'reasoning-start' }));
		supervisor.ingestChunkJson(JSON.stringify({ type: 'reasoning-delta', delta: 'Thinking' }));
		supervisor.ingestChunkJson(JSON.stringify({ type: 'finish' }));

		expect(supervisor.getOutcome()).toMatchObject({
			state: 'empty_invalid',
			errorKey: 'run.empty_output_invalid'
		});
	});
});

describe('classifyGenerationFailureKind', () => {
	it('distinguishes retryable and permanent failures', () => {
		expect(classifyGenerationFailureKind('429 rate limited upstream')).toBe('retryable');
		expect(classifyGenerationFailureKind('This model does not support image input')).toBe(
			'permanent'
		);
	});
});
