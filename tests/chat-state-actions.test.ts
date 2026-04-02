import { describe, expect, it } from 'vitest';
import {
	buildSelectedMessageIdsForMessage,
	switchSelectedMessageBranch
} from '$lib/hooks/chat-state/actions';
import type { UIMessageWithTree } from '$lib/types/message';

const messages = [
	{
		id: 'user-1',
		role: 'user',
		parentId: null,
		parts: [{ type: 'text', text: 'hello' }]
	},
	{
		id: 'assistant-1',
		role: 'assistant',
		parentId: 'user-1',
		parts: [{ type: 'text', text: 'hi' }]
	},
	{
		id: 'user-2a',
		role: 'user',
		parentId: 'assistant-1',
		parts: [{ type: 'text', text: 'branch a' }]
	},
	{
		id: 'user-2b',
		role: 'user',
		parentId: 'assistant-1',
		parts: [{ type: 'text', text: 'branch b' }]
	},
	{
		id: 'assistant-2b',
		role: 'assistant',
		parentId: 'user-2b',
		parts: [{ type: 'text', text: 'reply b' }]
	}
] as UIMessageWithTree[];

describe('chat state actions', () => {
	it('builds selected ids along the message path', () => {
		const selectedIds = buildSelectedMessageIdsForMessage(messages, {}, 'assistant-2b');

		expect(selectedIds).toEqual({
			root: 'user-1',
			'user-1': 'assistant-1',
			'assistant-1': 'user-2b',
			'user-2b': 'assistant-2b'
		});
	});

	it('returns null when selection already matches or message is missing', () => {
		expect(
			buildSelectedMessageIdsForMessage(
				messages,
				{
					root: 'user-1',
					'user-1': 'assistant-1',
					'assistant-1': 'user-2b',
					'user-2b': 'assistant-2b'
				},
				'assistant-2b'
			)
		).toBeNull();
		expect(buildSelectedMessageIdsForMessage(messages, {}, 'missing')).toBeNull();
	});

	it('switches branches with root fallback', () => {
		expect(
			switchSelectedMessageBranch(
				{
					root: 'user-1',
					'user-1': 'assistant-1'
				},
				'assistant-1',
				'user-2a'
			)
		).toEqual({
			root: 'user-1',
			'user-1': 'assistant-1',
			'assistant-1': 'user-2a'
		});

		expect(switchSelectedMessageBranch({}, '', 'user-1')).toEqual({
			root: 'user-1'
		});
	});
});
