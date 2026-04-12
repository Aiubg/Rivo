import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	appendRunEvent,
	deleteMessageById,
	getGenerationRunById,
	getRunEventsAfterSeq,
	updateGenerationRunStatus,
	upsertMessage
} from '$lib/server/db/queries';
import { handleServerError } from '$lib/server/utils';
import { runExecutor } from '$lib/server/ai/run-executor';
import { runEventBus } from '$lib/server/ai/run-event-bus';
import { aggregateRunEventsToParts } from '$lib/server/ai/utils';
import { hasVisibleMessageParts } from '$lib/ai/ui-message-stream-supervisor';

export const POST: RequestHandler = async ({ params, locals: { user } }) => {
	if (!user) {
		throw error(401, 'common.unauthorized');
	}

	const runId = params.runId;
	const runRes = await getGenerationRunById({ id: runId });
	if (runRes.isErr()) {
		if (runRes.error._tag === 'DbEntityNotFoundError') {
			throw error(404, 'common.not_found');
		}
		handleServerError(runRes.error, 'common.internal_server_error', { runId });
	}
	const run = runRes.value;
	if (run.userId !== user.id) {
		throw error(403, 'common.forbidden');
	}

	await updateGenerationRunStatus({ runId, status: 'canceled' }).match(
		() => undefined,
		(e) => handleServerError(e, 'common.internal_server_error', { runId })
	);

	runExecutor.cancel(runId);

	const finishEv = await appendRunEvent({ runId, chunkJson: JSON.stringify({ type: 'finish' }) });
	if (finishEv.isOk()) {
		runEventBus.emit({ runId, seq: finishEv.value.seq, chunk: finishEv.value.chunk });
	}

	// Persist current message state so it doesn't disappear on refresh
	const eventsRes = await getRunEventsAfterSeq({ runId, afterSeq: 0 });
	if (eventsRes.isOk()) {
		const parts = aggregateRunEventsToParts(eventsRes.value);

		if (hasVisibleMessageParts(parts as never)) {
			await upsertMessage({
				entry: {
					id: run.assistantMessageId,
					chatId: run.chatId,
					role: 'assistant',
					parentId: run.userMessageId,
					parts: parts as never,
					attachments: [],
					createdAt: new Date()
				}
			});
		} else {
			await deleteMessageById({ id: run.assistantMessageId });
		}
	}

	return new Response(null, { status: 204 });
};
