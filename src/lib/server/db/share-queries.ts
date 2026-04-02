import { and, asc, desc, or, sql } from 'drizzle-orm';
import { err, fromPromise, ok, safeTry, type ResultAsync } from 'neverthrow';
import { chat, type Chat, message, type Message, share, type Share } from '$lib/server/db/schema';
import type { DbError } from '$lib/server/errors/db';
import { DbInternalError } from '$lib/server/errors/db';
import { unwrapSingleQueryResult } from '$lib/server/db/utils';
import { mapChatSearchResults } from '$lib/server/db/chat-search';
import {
	db,
	ensureMessageSearchTextColumn,
	eq,
	isMissingUnreadColumnError
} from '$lib/server/db/runtime';

export function createShare({
	id,
	chatId,
	userId
}: {
	id: string;
	chatId: string;
	userId: string;
}): ResultAsync<Share, DbError> {
	return safeTry(async function* () {
		const insertResult = yield* fromPromise(
			db
				.insert(share)
				.values({
					id,
					chatId,
					userId,
					createdAt: new Date()
				})
				.returning(),
			(error) => new DbInternalError({ cause: error })
		);

		return unwrapSingleQueryResult(insertResult, id, 'Share');
	});
}

export function getShareById({ id }: { id: string }): ResultAsync<Share, DbError> {
	return safeTry(async function* () {
		const shareResult = yield* fromPromise(
			db.select().from(share).where(eq(share.id, id)),
			(error) => new DbInternalError({ cause: error })
		);

		return unwrapSingleQueryResult(shareResult, id, 'Share');
	});
}

export function getShareByChatId({ chatId }: { chatId: string }): ResultAsync<Share, DbError> {
	return safeTry(async function* () {
		const shareResult = yield* fromPromise(
			db.select().from(share).where(eq(share.chatId, chatId)),
			(error) => new DbInternalError({ cause: error })
		);

		return unwrapSingleQueryResult(shareResult, chatId, 'Share');
	});
}

export function getSharesByUserId({
	userId
}: {
	userId: string;
}): ResultAsync<Array<Share & { chat: { title: string } }>, DbError> {
	return fromPromise(
		db
			.select({
				id: share.id,
				chatId: share.chatId,
				userId: share.userId,
				createdAt: share.createdAt,
				chat: {
					title: chat.title
				}
			})
			.from(share)
			.innerJoin(chat, eq(share.chatId, chat.id))
			.where(eq(share.userId, userId))
			.orderBy(desc(share.createdAt)),
		(error) => new DbInternalError({ cause: error })
	);
}

export function deleteShareById({ id }: { id: string }): ResultAsync<undefined, DbError> {
	return safeTry(async function* () {
		yield* fromPromise(
			db.delete(share).where(eq(share.id, id)),
			(error) => new DbInternalError({ cause: error })
		);
		return ok(undefined);
	});
}

export function getChatByShareId({
	shareId
}: {
	shareId: string;
}): ResultAsync<{ chat: Chat; messages: Message[] }, DbError> {
	return safeTry(async function* () {
		yield* fromPromise(
			ensureMessageSearchTextColumn(),
			(error) => new DbInternalError({ cause: error })
		);
		const shareRecord = yield* getShareById({ id: shareId });

		let chatResult: { chatRows: Chat[]; messagesRows: Message[] };
		try {
			chatResult = yield* fromPromise(
				db.transaction(async (tx) => {
					const chatRows = await tx.select().from(chat).where(eq(chat.id, shareRecord.chatId));
					const messagesRows = await tx
						.select()
						.from(message)
						.where(eq(message.chatId, shareRecord.chatId))
						.orderBy(asc(message.createdAt));
					return { chatRows, messagesRows };
				}),
				(error) => new DbInternalError({ cause: error })
			);
		} catch (error) {
			if (!isMissingUnreadColumnError(error)) {
				return err(new DbInternalError({ cause: error }));
			}
			chatResult = yield* fromPromise(
				db.transaction(async (tx) => {
					const chatRows = await tx
						.select({
							id: chat.id,
							createdAt: chat.createdAt,
							updatedAt: chat.updatedAt,
							title: chat.title,
							userId: chat.userId,
							visibility: chat.visibility,
							pinned: chat.pinned
						})
						.from(chat)
						.where(eq(chat.id, shareRecord.chatId));
					const messagesRows = await tx
						.select()
						.from(message)
						.where(eq(message.chatId, shareRecord.chatId))
						.orderBy(asc(message.createdAt));
					return {
						chatRows: chatRows.map((row) => ({ ...row, unread: false })),
						messagesRows
					};
				}),
				(error) => new DbInternalError({ cause: error })
			);
		}

		const chatRecord = yield* unwrapSingleQueryResult(
			chatResult.chatRows,
			shareRecord.chatId,
			'Chat'
		);

		return ok({ chat: chatRecord, messages: chatResult.messagesRows });
	});
}

export function searchChats({ userId, query }: { userId: string; query: string }): ResultAsync<
	Array<{
		chatId: string;
		chatTitle: string;
		messageId?: string;
		messageSnippet: string;
		createdAt: Date;
	}>,
	DbError
> {
	return safeTry(async function* () {
		yield* fromPromise(
			ensureMessageSearchTextColumn(),
			(error) => new DbInternalError({ cause: error })
		);
		const escapedQuery = query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
		const searchPattern = `%${escapedQuery}%`;
		const results = yield* fromPromise(
			db
				.select({
					chatId: chat.id,
					chatTitle: chat.title,
					messageId: message.id,
					messageSearchText: message.searchText,
					createdAt: message.createdAt,
					updatedAt: chat.updatedAt
				})
				.from(chat)
				.leftJoin(message, eq(chat.id, message.chatId))
				.where(
					and(
						eq(chat.userId, userId),
						or(
							sql`${chat.title} LIKE ${searchPattern} ESCAPE '\\'`,
							sql`${message.searchText} LIKE ${searchPattern} ESCAPE '\\'`
						)
					)
				)
				.orderBy(desc(chat.updatedAt), desc(message.createdAt))
				.limit(50),
			(error) => new DbInternalError({ cause: error })
		);

		return ok(mapChatSearchResults(results, query));
	});
}
