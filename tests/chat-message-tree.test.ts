import { describe, expect, it } from 'vitest';
import {
	computeMessagesWithSiblingsFromIndex,
	createMessageTreeIndex,
	getUserMessages,
	getMessagePath,
	getMessagePathFromIndex,
	resolveActiveUserMessageId,
	type MessageTreeIndex
} from '$lib/utils/chat';
import type { UIMessageWithTree } from '$lib/types/message';

function createMessage(overrides: Partial<UIMessageWithTree>): UIMessageWithTree {
	return {
		id: 'message-id',
		role: 'user',
		parts: [],
		parentId: null,
		...overrides
	};
}

function createFixture(): { messages: UIMessageWithTree[]; index: MessageTreeIndex } {
	const messages = [
		createMessage({ id: 'user-1', role: 'user' }),
		createMessage({ id: 'assistant-1', role: 'assistant', parentId: 'user-1' }),
		createMessage({ id: 'user-2a', role: 'user', parentId: 'assistant-1' }),
		createMessage({ id: 'user-2b', role: 'user', parentId: 'assistant-1' }),
		createMessage({ id: 'assistant-2b', role: 'assistant', parentId: 'user-2b' })
	];

	return {
		messages,
		index: createMessageTreeIndex(messages)
	};
}

describe('chat message tree helpers', () => {
	it('reuses a shared tree index to resolve the visible path', () => {
		const { messages, index } = createFixture();
		const selectedMessageIds = {
			root: 'user-1',
			'user-1': 'assistant-1',
			'assistant-1': 'user-2b',
			'user-2b': 'assistant-2b'
		};

		expect(getMessagePathFromIndex(index, selectedMessageIds).map((message) => message.id)).toEqual(
			['user-1', 'assistant-1', 'user-2b', 'assistant-2b']
		);
		expect(getMessagePath(messages, selectedMessageIds).map((message) => message.id)).toEqual([
			'user-1',
			'assistant-1',
			'user-2b',
			'assistant-2b'
		]);
	});

	it('falls back to the first sibling when selection is missing or invalid', () => {
		const { index } = createFixture();

		expect(getMessagePathFromIndex(index, {}).map((message) => message.id)).toEqual([
			'user-1',
			'assistant-1',
			'user-2a'
		]);
		expect(
			getMessagePathFromIndex(index, {
				root: 'user-1',
				'user-1': 'assistant-1',
				'assistant-1': 'missing'
			}).map((message) => message.id)
		).toEqual(['user-1', 'assistant-1', 'user-2a']);
	});

	it('computes sibling positions without rescanning each sibling list', () => {
		const { index } = createFixture();
		const visibleMessages = getMessagePathFromIndex(index, {
			root: 'user-1',
			'user-1': 'assistant-1',
			'assistant-1': 'user-2b',
			'user-2b': 'assistant-2b'
		});

		expect(
			computeMessagesWithSiblingsFromIndex(index, visibleMessages).map((entry) => ({
				id: entry.message.id,
				siblings: entry.siblings,
				currentIndex: entry.currentIndex
			}))
		).toEqual([
			{ id: 'user-1', siblings: ['user-1'], currentIndex: 0 },
			{ id: 'assistant-1', siblings: ['assistant-1'], currentIndex: 0 },
			{ id: 'user-2b', siblings: ['user-2a', 'user-2b'], currentIndex: 1 },
			{ id: 'assistant-2b', siblings: ['assistant-2b'], currentIndex: 0 }
		]);
	});

	it('filters outline messages down to user messages only', () => {
		const { messages } = createFixture();

		expect(getUserMessages(messages).map((message) => message.id)).toEqual([
			'user-1',
			'user-2a',
			'user-2b'
		]);
	});

	it('maps outline highlight to the nearest user message at or above the active message', () => {
		const { messages } = createFixture();

		expect(resolveActiveUserMessageId(messages, 'user-2b')).toBe('user-2b');
		expect(resolveActiveUserMessageId(messages, 'assistant-2b')).toBe('user-2b');
		expect(resolveActiveUserMessageId(messages, 'missing')).toBeNull();
		expect(resolveActiveUserMessageId(messages, null)).toBeNull();
	});
});
