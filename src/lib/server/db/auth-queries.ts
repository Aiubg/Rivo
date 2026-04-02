import { logger } from '$lib/utils/logger';
import { genSalt, hash as bcryptHash } from 'bcrypt-ts';
import { fromPromise, ok, safeTry, type ResultAsync } from 'neverthrow';
import ms from 'ms';
import { type AuthUser, type Session, session, type User, user } from '$lib/server/db/schema';
import type { DbError } from '$lib/server/errors/db';
import { DbInternalError } from '$lib/server/errors/db';
import { unwrapSingleQueryResult } from '$lib/server/db/utils';
import { db, eq } from '$lib/server/db/runtime';

export function getAuthUser(email: string): ResultAsync<AuthUser, DbError> {
	return safeTry(async function* () {
		const userResult = yield* fromPromise(
			db.select().from(user).where(eq(user.email, email)),
			(error) => new DbInternalError({ cause: error })
		);
		return unwrapSingleQueryResult(userResult, email, 'User');
	});
}

export function getUserById(userId: string): ResultAsync<User, DbError> {
	return safeTry(async function* () {
		const userResult = yield* fromPromise(
			db.select().from(user).where(eq(user.id, userId)),
			(error) => new DbInternalError({ cause: error })
		);
		return unwrapSingleQueryResult(userResult, userId, 'User');
	});
}

export function createAuthUser(email: string, password: string): ResultAsync<AuthUser, DbError> {
	return safeTry(async function* () {
		const salt = yield* fromPromise(genSalt(10), (error) => new DbInternalError({ cause: error }));
		const passwordHash = yield* fromPromise(
			bcryptHash(password, salt),
			(error) => new DbInternalError({ cause: error })
		);

		const userResult = yield* fromPromise(
			db
				.insert(user)
				.values({ id: crypto.randomUUID(), email, password: passwordHash })
				.returning(),
			(error) => {
				logger.error('Failed to create auth user', error);
				return new DbInternalError({ cause: error });
			}
		);

		return unwrapSingleQueryResult(userResult, email, 'User');
	});
}

export function createSession(value: Session): ResultAsync<Session, DbError> {
	return safeTry(async function* () {
		const sessionResult = yield* fromPromise(
			db.insert(session).values(value).returning(),
			(error) => new DbInternalError({ cause: error })
		);
		return unwrapSingleQueryResult(sessionResult, value.id, 'Session');
	});
}

export function getFullSession(
	sessionId: string
): ResultAsync<{ session: Session; user: User }, DbError> {
	return safeTry(async function* () {
		const sessionResult = yield* fromPromise(
			db
				.select({
					user: {
						id: user.id,
						email: user.email,
						displayName: user.displayName,
						avatarUrl: user.avatarUrl
					},
					session
				})
				.from(session)
				.innerJoin(user, eq(session.userId, user.id))
				.where(eq(session.id, sessionId)),
			(error) => new DbInternalError({ cause: error })
		);
		return unwrapSingleQueryResult(sessionResult, sessionId, 'Session');
	});
}

export function updateUserProfile({
	userId,
	displayName,
	avatarUrl
}: {
	userId: string;
	displayName?: string | null;
	avatarUrl?: string | null;
}): ResultAsync<User, DbError> {
	return safeTry(async function* () {
		const updateValues: Partial<typeof user.$inferInsert> = {};
		if (displayName !== undefined) updateValues.displayName = displayName;
		if (avatarUrl !== undefined) updateValues.avatarUrl = avatarUrl;

		if (Object.keys(updateValues).length === 0) {
			const userResult = yield* fromPromise(
				db.select().from(user).where(eq(user.id, userId)),
				(error) => new DbInternalError({ cause: error })
			);
			return unwrapSingleQueryResult(userResult, userId, 'User');
		}

		const userResult = yield* fromPromise(
			db.update(user).set(updateValues).where(eq(user.id, userId)).returning(),
			(error) => new DbInternalError({ cause: error })
		);
		return unwrapSingleQueryResult(userResult, userId, 'User');
	});
}

export function deleteSession(sessionId: string): ResultAsync<undefined, DbError> {
	return safeTry(async function* () {
		yield* fromPromise(
			db.delete(session).where(eq(session.id, sessionId)),
			(error) => new DbInternalError({ cause: error })
		);

		return ok(undefined);
	});
}

export function extendSession(sessionId: string): ResultAsync<Session, DbError> {
	return safeTry(async function* () {
		const sessionResult = yield* fromPromise(
			db
				.update(session)
				.set({ expiresAt: new Date(Date.now() + ms('30d')) })
				.where(eq(session.id, sessionId))
				.returning(),
			(error) => new DbInternalError({ cause: error })
		);

		return unwrapSingleQueryResult(sessionResult, sessionId, 'Session');
	});
}

export function deleteSessionsForUser(userId: string): ResultAsync<undefined, DbError> {
	return safeTry(async function* () {
		yield* fromPromise(
			db.delete(session).where(eq(session.userId, userId)),
			(error) => new DbInternalError({ cause: error })
		);

		return ok(undefined);
	});
}
