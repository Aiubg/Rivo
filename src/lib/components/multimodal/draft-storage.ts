import { legacyStorageKeys, storageKeys } from '$lib/utils/storage-keys';

export function getChatDraftStorageKey(chatId?: string | null): string {
	return storageKeys.chatDraft(chatId);
}

export function getLegacyChatDraftStorageKey(chatId?: string | null): string {
	return legacyStorageKeys.chatDraft(chatId);
}
