export {
	createAuthUser,
	createSession,
	deleteSession,
	deleteSessionsForUser,
	extendSession,
	getAuthUser,
	getFullSession,
	getUserById,
	updateUserProfile
} from '$lib/server/db/auth-queries';

export {
	appendRunEvent,
	appendRunEvents,
	createGenerationRun,
	failAllActiveGenerationRuns,
	getActiveGenerationRunByChatId,
	getActiveRunChatIdsByUserId,
	getGenerationRunById,
	getGenerationRunsByChatId,
	getRunEventsAfterSeq,
	updateGenerationRunStatus
} from '$lib/server/db/run-queries';

export {
	deleteAllChatsByUserId,
	deleteChatById,
	getChatById,
	getChatsByUserId,
	saveChat,
	updateChatPinnedById,
	updateChatTitleById,
	updateChatUnreadById
} from '$lib/server/db/chat-queries';

export {
	deleteMessageById,
	deleteMessagesByChatIdAfterTimestamp,
	deleteTrailingMessages,
	getMessageById,
	getMessagesByChatId,
	getMessagesByChatIds,
	getVotesByChatId,
	saveMessages,
	upsertMessage,
	updateMessagePartsById,
	voteMessage
} from '$lib/server/db/message-queries';

export {
	createShare,
	deleteShareById,
	getChatByShareId,
	getShareByChatId,
	getShareById,
	getSharesByUserId,
	searchChats
} from '$lib/server/db/share-queries';
