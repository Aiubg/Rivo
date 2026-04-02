import { and, asc, gte, inArray } from 'drizzle-orm';
import { fromPromise, ok, safeTry, type ResultAsync } from 'neverthrow';
import {
	chat,
	type Message,
	message,
	type NewMessage,
	vote,
	type Vote
} from '$lib/server/db/schema';
import type { DbError } from '$lib/server/errors/db';
import { DbInternalError } from '$lib/server/errors/db';
import { unwrapSingleQueryResult } from '$lib/server/db/utils';
import { extractSearchTextFromParts } from '$lib/utils/chat';
import { db, ensureMessageSearchTextColumn, eq, runSerializedWrite } from '$lib/server/db/runtime';

export function saveMessages({
	messages
}: {
	messages: Array<NewMessage>;
}): ResultAsync<Message[], DbError> {
	return safeTry(async function* () {
		if (messages.length === 0) {
			return ok([]);
		}

		yield* fromPromise(
			ensureMessageSearchTextColumn(),
			(error) => new DbInternalError({ cause: error })
		);
		const messageValues = messages.map((entry) => ({
			...entry,
			searchText:
				typeof entry.searchText === 'string'
					? entry.searchText
					: extractSearchTextFromParts(entry.parts)
		}));

		const insertResult = yield* fromPromise(
			runSerializedWrite(() =>
				db.insert(message).values(messageValues).onConflictDoNothing().returning()
			),
			(error) => new DbInternalError({ cause: error })
		);

		const chatId = messages[0]!.chatId;
		yield* fromPromise(
			runSerializedWrite(() =>
				db.update(chat).set({ updatedAt: new Date() }).where(eq(chat.id, chatId))
			),
			(error) => new DbInternalError({ cause: error })
		);

		return ok(insertResult);
	});
}

export function getMessagesByChatId({ id }: { id: string }): ResultAsync<Message[], DbError> {
	return safeTry(async function* () {
		yield* fromPromise(
			ensureMessageSearchTextColumn(),
			(error) => new DbInternalError({ cause: error })
		);
		const rows = yield* fromPromise(
			db.select().from(message).where(eq(message.chatId, id)).orderBy(asc(message.createdAt)),
			(error) => new DbInternalError({ cause: error })
		);

		return ok(rows);
	});
}

export function getMessagesByChatIds({
	chatIds
}: {
	chatIds: string[];
}): ResultAsync<Message[], DbError> {
	return safeTry(async function* () {
		if (chatIds.length === 0) {
			return ok([]);
		}

		yield* fromPromise(
			ensureMessageSearchTextColumn(),
			(error) => new DbInternalError({ cause: error })
		);
		const rows = yield* fromPromise(
			db
				.select()
				.from(message)
				.where(inArray(message.chatId, chatIds))
				.orderBy(asc(message.chatId), asc(message.createdAt)),
			(error) => new DbInternalError({ cause: error })
		);

		return ok(rows);
	});
}

export function voteMessage({
	chatId,
	messageId,
	type
}: {
	chatId: string;
	messageId: string;
	type: 'up' | 'down';
}): ResultAsync<undefined, DbError> {
	return safeTry(async function* () {
		yield* fromPromise(
			db
				.insert(vote)
				.values({
					chatId,
					messageId,
					isUpvoted: type === 'up'
				})
				.onConflictDoUpdate({
					target: [vote.messageId, vote.chatId],
					set: { isUpvoted: type === 'up' }
				}),
			(error) => new DbInternalError({ cause: error })
		);
		return ok(undefined);
	});
}

export function getVotesByChatId({ id }: { id: string }): ResultAsync<Vote[], DbError> {
	return fromPromise(
		db.select().from(vote).where(eq(vote.chatId, id)),
		(error) => new DbInternalError({ cause: error })
	);
}

export function getMessageById({ id }: { id: string }): ResultAsync<Message, DbError> {
	return safeTry(async function* () {
		yield* fromPromise(
			ensureMessageSearchTextColumn(),
			(error) => new DbInternalError({ cause: error })
		);
		const msgRows = yield* fromPromise(
			db.select().from(message).where(eq(message.id, id)),
			(error) => new DbInternalError({ cause: error })
		);

		return unwrapSingleQueryResult(msgRows, id, 'Message');
	});
}

export function updateMessagePartsById({
	messageId,
	parts
}: {
	messageId: string;
	parts: Message['parts'];
}): ResultAsync<undefined, DbError> {
	return safeTry(async function* () {
		yield* fromPromise(
			ensureMessageSearchTextColumn(),
			(error) => new DbInternalError({ cause: error })
		);
		yield* fromPromise(
			runSerializedWrite(() =>
				db
					.update(message)
					.set({ parts, searchText: extractSearchTextFromParts(parts) })
					.where(eq(message.id, messageId))
			),
			(error) => new DbInternalError({ cause: error })
		);
		return ok(undefined);
	});
}

export function deleteMessagesByChatIdAfterTimestamp({
	chatId,
	timestamp
}: {
	chatId: string;
	timestamp: Date;
}): ResultAsync<undefined, DbError> {
	return safeTry(async function* () {
		yield* fromPromise(
			runSerializedWrite(() =>
				db.delete(message).where(and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)))
			),
			(error) => new DbInternalError({ cause: error })
		);
		return ok(undefined);
	});
}

export function deleteTrailingMessages({ id }: { id: string }): ResultAsync<undefined, DbError> {
	return safeTry(async function* () {
		const currentMessage = yield* getMessageById({ id });
		yield* deleteMessagesByChatIdAfterTimestamp({
			chatId: currentMessage.chatId,
			timestamp: currentMessage.createdAt
		});
		return ok(undefined);
	});
}
