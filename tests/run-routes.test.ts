import { describe, expect, it, vi } from 'vitest';
import { ok } from 'neverthrow';

vi.mock('$lib/server/db/queries', () => ({
	getGenerationRunById: vi.fn(),
	getRunEventsAfterSeq: vi.fn(),
	updateGenerationRunStatus: vi.fn(),
	appendRunEvent: vi.fn(),
	updateMessagePartsById: vi.fn()
}));

vi.mock('$lib/server/ai/run-executor', () => ({
	runExecutor: {
		cancel: vi.fn(),
		enqueue: vi.fn()
	}
}));

vi.mock('$lib/server/ai/run-event-bus', () => ({
	runEventBus: {
		subscribe: vi.fn(),
		emit: vi.fn()
	}
}));

import { POST as startRunRoute } from '../src/routes/(chat)/api/runs/+server';
import { POST as cancelRunRoute } from '../src/routes/(chat)/api/runs/[runId]/cancel/+server';
import { GET as streamRunRoute } from '../src/routes/(chat)/api/runs/[runId]/stream/+server';
import { getGenerationRunById } from '$lib/server/db/queries';

const getGenerationRunByIdMock = vi.mocked(getGenerationRunById);

describe('run api routes', () => {
	it('rejects run creation without an authenticated user', async () => {
		await expect(
			startRunRoute({
				locals: {},
				cookies: {
					get: () => 'test-model'
				},
				request: new Request('http://localhost/api/runs', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id: 'chat-1',
						assistantMessageId: 'assistant-1',
						messages: [
							{
								id: 'user-1',
								role: 'user',
								content: 'hello',
								parts: [{ type: 'text', text: 'hello' }]
							}
						]
					})
				})
			} as never)
		).rejects.toMatchObject({ status: 401 });
	});

	it('rejects stream access for a run owned by another user', async () => {
		getGenerationRunByIdMock.mockResolvedValueOnce(
			ok({
				id: 'run-1',
				chatId: 'chat-1',
				userId: 'owner-user',
				status: 'running',
				modelId: 'model-1',
				userMessageId: 'user-1',
				assistantMessageId: 'assistant-1',
				messages: [],
				personalization: {},
				cursor: 0,
				createdAt: new Date(),
				startedAt: new Date(),
				finishedAt: null,
				error: null
			})
		);

		await expect(
			streamRunRoute({
				params: { runId: 'run-1' },
				locals: { user: { id: 'other-user' } },
				url: new URL('http://localhost/api/runs/run-1/stream?cursor=0'),
				request: new Request('http://localhost/api/runs/run-1/stream')
			} as never)
		).rejects.toMatchObject({ status: 403 });
	});

	it('rejects cancel access for a run owned by another user', async () => {
		getGenerationRunByIdMock.mockResolvedValueOnce(
			ok({
				id: 'run-2',
				chatId: 'chat-2',
				userId: 'owner-user',
				status: 'running',
				modelId: 'model-1',
				userMessageId: 'user-2',
				assistantMessageId: 'assistant-2',
				messages: [],
				personalization: {},
				cursor: 2,
				createdAt: new Date(),
				startedAt: new Date(),
				finishedAt: null,
				error: null
			})
		);

		await expect(
			cancelRunRoute({
				params: { runId: 'run-2' },
				locals: { user: { id: 'other-user' } }
			} as never)
		).rejects.toMatchObject({ status: 403 });
	});
});
