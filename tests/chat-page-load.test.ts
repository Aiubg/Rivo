import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from 'neverthrow';

vi.mock('$lib/server/db/queries', () => ({
	getChatById: vi.fn(),
	getMessagesByChatId: vi.fn(),
	getActiveGenerationRunByChatId: vi.fn(),
	getRunEventsAfterSeq: vi.fn(),
	getGenerationRunsByChatId: vi.fn(),
	updateMessagePartsById: vi.fn()
}));

import { load } from '../src/routes/(chat)/chat/[chatId]/+page.server';
import { getChatById, getMessagesByChatId } from '$lib/server/db/queries';

const getChatByIdMock = vi.mocked(getChatById);
const getMessagesByChatIdMock = vi.mocked(getMessagesByChatId);

describe('chat page load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('rejects direct chat access for non-owners regardless of visibility', async () => {
		getChatByIdMock.mockResolvedValueOnce(
			ok({
				id: 'chat-1',
				createdAt: new Date(),
				updatedAt: new Date(),
				title: 'Shared elsewhere',
				userId: 'owner-user',
				visibility: 'public',
				pinned: false,
				unread: false
			})
		);

		await expect(
			load({
				params: { chatId: 'chat-1' },
				locals: { user: { id: 'other-user' } }
			} as never)
		).rejects.toMatchObject({ status: 404 });
		expect(getMessagesByChatIdMock).not.toHaveBeenCalled();
	});
});
