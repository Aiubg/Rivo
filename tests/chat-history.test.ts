import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/utils/network', () => ({ fetchWithTimeout: vi.fn() }));
vi.mock('$lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { fetchWithTimeout } from '$lib/utils/network';
import { ChatHistory } from '$lib/hooks/chat-history.svelte';
import type { Chat } from '$lib/types/db';

const mockFetch = vi.mocked(fetchWithTimeout);

function makeChat(overrides: Partial<Chat> = {}): Chat {
	return {
		id: 'c1',
		createdAt: new Date(0),
		updatedAt: new Date(0),
		title: 'old title',
		userId: 'u1',
		visibility: 'private',
		pinned: false,
		unread: false,
		...overrides
	};
}

describe('ChatHistory optimistic updates', () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	it('applies an optimistic title change and keeps it when the request succeeds', async () => {
		mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
		const history = new ChatHistory([makeChat()]);

		const pending = history.updateTitle('c1', 'new title');
		expect(history.chats[0]?.title).toBe('new title');

		await pending;
		expect(history.chats[0]?.title).toBe('new title');
		expect(mockFetch).toHaveBeenCalledWith(
			'/api/chat/title',
			expect.objectContaining({ body: JSON.stringify({ chatId: 'c1', title: 'new title' }) })
		);
	});

	it('rolls back the title when the request throws', async () => {
		mockFetch.mockRejectedValue(new Error('network down'));
		const history = new ChatHistory([makeChat()]);

		await history.updateTitle('c1', 'new title');
		expect(history.chats[0]?.title).toBe('old title');
	});

	it('applies an optimistic pinned change and rolls back to the prior state on failure', async () => {
		mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
		const history = new ChatHistory([makeChat()]);

		const pending = history.updatePinned('c1', true);
		expect(history.chats[0]?.pinned).toBe(true);
		await pending;
		expect(history.chats[0]?.pinned).toBe(true);

		mockFetch.mockRejectedValue(new Error('network down'));
		await history.updatePinned('c1', false);
		expect(history.chats[0]?.pinned).toBe(true);
	});
});
