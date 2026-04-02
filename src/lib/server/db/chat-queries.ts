import { logger } from '$lib/utils/logger';
import { and, desc, inArray, eq as rawEq } from 'drizzle-orm';
import { err, fromPromise, ok, safeTry, type ResultAsync } from 'neverthrow';
import { chat, message, share, type Chat, vote } from '$lib/server/db/schema';
import type { DbError } from '$lib/server/errors/db';
import { DbInternalError } from '$lib/server/errors/db';
import { unwrapSingleQueryResult } from '$lib/server/db/utils';
import { db, eq, isMissingUnreadColumnError, runSerializedWrite } from '$lib/server/db/runtime';

export function saveChat({
	id,
	userId,
	title
}: {
	id: string;
	userId: string;
	title: string;
}): ResultAsync<Chat, DbError> {
	return safeTry(async function* () {
		const now = new Date();
		const insertResult = yield* fromPromise(
			runSerializedWrite(() =>
				db
					.insert(chat)
					.values({
						id,
						createdAt: now,
						updatedAt: now,
						userId,
						title
					})
					.returning()
			),
			(error) => new DbInternalError({ cause: error })
		);

		return unwrapSingleQueryResult(insertResult, id, 'Chat');
	});
}

export function deleteChatById({ id }: { id: string }): ResultAsync<void, DbError> {
	return safeTry(async function* () {
		yield* fromPromise(
			db.transaction(async (tx) => {
				await tx.delete(vote).where(rawEq(vote.chatId, id));
				await tx.delete(share).where(rawEq(share.chatId, id));
				await tx.delete(message).where(rawEq(message.chatId, id));
				await tx.delete(chat).where(rawEq(chat.id, id));
			}),
			(error) => {
				logger.error('Failed to delete chat', error);
				return new DbInternalError({ cause: error });
			}
		);
		return ok(undefined);
	});
}

export function deleteAllChatsByUserId({ userId }: { userId: string }): ResultAsync<void, DbError> {
	return safeTry(async function* () {
		yield* fromPromise(
			db.transaction(async (tx) => {
				const userChats = await tx
					.select({ id: chat.id })
					.from(chat)
					.where(rawEq(chat.userId, userId));

				const chatIds = userChats.map((entry) => entry.id);

				if (chatIds.length > 0) {
					const chunkSize = 900;
					for (let i = 0; i < chatIds.length; i += chunkSize) {
						const chunk = chatIds.slice(i, i + chunkSize);
						await tx.delete(vote).where(inArray(vote.chatId, chunk));
						await tx.delete(share).where(inArray(share.chatId, chunk));
						await tx.delete(message).where(inArray(message.chatId, chunk));
					}
					await tx.delete(chat).where(rawEq(chat.userId, userId));
				}
			}),
			(error) => {
				logger.error('Failed to delete all chats', error);
				return new DbInternalError({ cause: error });
			}
		);
		return ok(undefined);
	});
}

export function getChatsByUserId({ id }: { id: string }): ResultAsync<Chat[], DbError> {
	return safeTry(async function* () {
		try {
			const rows = yield* fromPromise(
				db.select().from(chat).where(eq(chat.userId, id)).orderBy(desc(chat.updatedAt)),
				(error) => new DbInternalError({ cause: error })
			);
			return ok(rows);
		} catch (error) {
			if (!isMissingUnreadColumnError(error)) {
				return err(new DbInternalError({ cause: error }));
			}

			const rows = yield* fromPromise(
				db
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
					.where(eq(chat.userId, id))
					.orderBy(desc(chat.updatedAt)),
				(error) => new DbInternalError({ cause: error })
			);
			return ok(rows.map((row) => ({ ...row, unread: false })));
		}
	});
}

export function getChatById({ id }: { id: string }): ResultAsync<Chat, DbError> {
	return safeTry(async function* () {
		let chatResult: Chat[];

		try {
			chatResult = yield* fromPromise(
				db.select().from(chat).where(eq(chat.id, id)),
				(error) => new DbInternalError({ cause: error })
			);
		} catch (error) {
			if (!isMissingUnreadColumnError(error)) {
				return err(new DbInternalError({ cause: error }));
			}

			const fallbackResult = yield* fromPromise(
				db
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
					.where(eq(chat.id, id)),
				(error) => new DbInternalError({ cause: error })
			);
			chatResult = fallbackResult.map((row) => ({ ...row, unread: false }));
		}

		return unwrapSingleQueryResult(chatResult, id, 'Chat');
	});
}

export function updateChatTitleById({
	chatId,
	title
}: {
	chatId: string;
	title: string;
}): ResultAsync<undefined, DbError> {
	return safeTry(async function* () {
		yield* fromPromise(
			runSerializedWrite(() => db.update(chat).set({ title }).where(eq(chat.id, chatId))),
			(error) => new DbInternalError({ cause: error })
		);
		return ok(undefined);
	});
}

export function updateChatPinnedById({
	chatId,
	pinned
}: {
	chatId: string;
	pinned: boolean;
}): ResultAsync<undefined, DbError> {
	return safeTry(async function* () {
		yield* fromPromise(
			db.update(chat).set({ pinned }).where(eq(chat.id, chatId)),
			(error) => new DbInternalError({ cause: error })
		);
		return ok(undefined);
	});
}

export function updateChatUnreadById({
	chatId,
	userId,
	unread
}: {
	chatId: string;
	userId?: string;
	unread: boolean;
}): ResultAsync<undefined, DbError> {
	return safeTry(async function* () {
		const whereClause = userId
			? and(eq(chat.id, chatId), eq(chat.userId, userId))
			: eq(chat.id, chatId);

		yield* fromPromise(
			runSerializedWrite(() => db.update(chat).set({ unread }).where(whereClause)),
			(error) => new DbInternalError({ cause: error })
		);
		return ok(undefined);
	});
}
