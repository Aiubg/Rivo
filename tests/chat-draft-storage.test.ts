import { describe, expect, it } from 'vitest';
import {
	getChatDraftStorageKey,
	getLegacyChatDraftStorageKey
} from '$lib/components/multimodal/draft-storage';

describe('getChatDraftStorageKey', () => {
	it('uses chat id for existing conversation drafts', () => {
		expect(getChatDraftStorageKey('chat-123')).toBe('rivo:v1:chat:draft:chat-123');
		expect(getLegacyChatDraftStorageKey('chat-123')).toBe('chat_input_draft:chat-123');
	});

	it('falls back to the new chat draft bucket when chat id is missing', () => {
		expect(getChatDraftStorageKey()).toBe('rivo:v1:chat:draft:new');
		expect(getChatDraftStorageKey(null)).toBe('rivo:v1:chat:draft:new');
		expect(getChatDraftStorageKey('')).toBe('rivo:v1:chat:draft:new');
		expect(getChatDraftStorageKey('   ')).toBe('rivo:v1:chat:draft:new');
		expect(getLegacyChatDraftStorageKey()).toBe('chat_input_draft:new');
	});
});
