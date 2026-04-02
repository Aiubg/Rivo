import { describe, expect, it } from 'vitest';
import { mapChatSearchResults } from '$lib/server/db/chat-search';

describe('chat search result mapping', () => {
	it('deduplicates repeated title matches from the same chat', () => {
		const updatedAt = new Date('2026-03-31T09:00:00.000Z');
		const results = mapChatSearchResults(
			[
				{
					chatId: 'chat-1',
					chatTitle: 'Release planning',
					messageId: 'message-2',
					messageSearchText: 'No query here',
					createdAt: new Date('2026-03-31T08:00:00.000Z'),
					updatedAt
				},
				{
					chatId: 'chat-1',
					chatTitle: 'Release planning',
					messageId: 'message-1',
					messageSearchText: 'Still unrelated',
					createdAt: new Date('2026-03-31T07:00:00.000Z'),
					updatedAt
				}
			],
			'release'
		);

		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			chatId: 'chat-1',
			chatTitle: 'Release planning',
			messageId: undefined,
			createdAt: updatedAt
		});
		expect(results[0]?.messageSnippet).toContain('Release');
	});

	it('prefers message matches over a redundant title-only result', () => {
		const results = mapChatSearchResults(
			[
				{
					chatId: 'chat-1',
					chatTitle: 'Release planning',
					messageId: 'message-2',
					messageSearchText: 'Status update only',
					createdAt: new Date('2026-03-31T08:00:00.000Z'),
					updatedAt: new Date('2026-03-31T09:00:00.000Z')
				},
				{
					chatId: 'chat-1',
					chatTitle: 'Release planning',
					messageId: 'message-1',
					messageSearchText: 'Release checklist for launch',
					createdAt: new Date('2026-03-31T07:00:00.000Z'),
					updatedAt: new Date('2026-03-31T09:00:00.000Z')
				}
			],
			'release'
		);

		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			chatId: 'chat-1',
			messageId: 'message-1'
		});
		expect(results[0]?.messageSnippet).toContain('Release');
	});
});
