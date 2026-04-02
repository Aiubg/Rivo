import {
	getChatById,
	getMessagesByChatId,
	getActiveGenerationRunByChatId,
	getRunEventsAfterSeq,
	getGenerationRunsByChatId,
	updateMessagePartsById
} from '$lib/server/db/queries';
import { aggregateRunEventsToParts } from '$lib/server/ai/utils';
import { error } from '@sveltejs/kit';
import { handleServerError } from '$lib/server/utils';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params: { chatId }, locals: { user } }) => {
	const chatResult = await getChatById({ id: chatId });
	if (chatResult.isErr()) {
		if (chatResult.error._tag === 'DbEntityNotFoundError') {
			throw error(404, 'common.not_found');
		}
		handleServerError(chatResult.error, 'common.internal_server_error', { chatId });
	}
	const chat = chatResult.value;

	if (chat.visibility === 'private') {
		if (!user || chat.userId !== user.id) {
			throw error(404, 'common.not_found');
		}
	}

	const messagesResult = await getMessagesByChatId({ id: chatId });
	if (messagesResult.isErr()) {
		handleServerError(messagesResult.error, 'common.internal_server_error', { chatId });
	}
	const messages = messagesResult.value;

	const hasToolParts = (parts: unknown) =>
		Array.isArray(parts) &&
		parts.some((p) => p && (p.type === 'tool-invocation' || p.type === 'dynamic-tool'));

	let activeRun = null;

	if (user) {
		const activeRunResult = await getActiveGenerationRunByChatId({
			chatId,
			userId: user.id
		});
		if (activeRunResult.isErr()) {
			handleServerError(activeRunResult.error, 'common.internal_server_error', {
				chatId,
				userId: user.id
			});
		}

		const run = activeRunResult.value;
		if (run) {
			const eventsResult = await getRunEventsAfterSeq({ runId: run.id, afterSeq: 0 });
			if (eventsResult.isErr()) {
				handleServerError(eventsResult.error, 'common.internal_server_error', {
					chatId,
					runId: run.id
				});
			}
			const events = eventsResult.value;

			if (events.length > 0) {
				const latestParts = aggregateRunEventsToParts(events);
				const lastEvent = events[events.length - 1];
				const lastSeq = lastEvent ? lastEvent.seq : 0;

				const assistantMessageIndex = messages.findIndex((m) => m.id === run.assistantMessageId);
				const assistantMessage =
					assistantMessageIndex !== -1 ? messages[assistantMessageIndex] : undefined;
				if (assistantMessage) {
					messages[assistantMessageIndex] = {
						...assistantMessage,
						parts: latestParts
					};
				}

				activeRun = {
					id: run.id,
					assistantMessageId: run.assistantMessageId,
					cursor: lastSeq
				};
			} else {
				activeRun = {
					id: run.id,
					assistantMessageId: run.assistantMessageId,
					cursor: 0
				};
			}
		}
	}

	const missingToolParts = messages.filter((m) => m.role === 'assistant' && !hasToolParts(m.parts));
	if (missingToolParts.length > 0) {
		const runsResult = await getGenerationRunsByChatId({ chatId });
		if (runsResult.isErr()) {
			handleServerError(runsResult.error, 'common.internal_server_error', { chatId });
		}
		const runByAssistantId = new Map(
			runsResult.value.map((run) => [run.assistantMessageId, run.id])
		);

		for (const msg of missingToolParts) {
			const runId = runByAssistantId.get(msg.id);
			if (!runId) continue;

			const eventsResult = await getRunEventsAfterSeq({ runId, afterSeq: 0 });
			if (eventsResult.isErr()) {
				handleServerError(eventsResult.error, 'common.internal_server_error', { chatId, runId });
			}
			const events = eventsResult.value;
			if (events.length === 0) continue;

			const latestParts = aggregateRunEventsToParts(events);
			if (latestParts.length === 0) continue;

			msg.parts = latestParts as typeof msg.parts;
			const updateResult = await updateMessagePartsById({ messageId: msg.id, parts: latestParts });
			if (updateResult.isErr()) {
				handleServerError(updateResult.error, 'common.internal_server_error', {
					chatId,
					messageId: msg.id
				});
			}
		}
	}

	return { chat, messages, activeRun };
};
