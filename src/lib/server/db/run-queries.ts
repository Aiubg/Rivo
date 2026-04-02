import { and, asc, desc, gte, inArray, or } from 'drizzle-orm';
import { err, fromPromise, ok, safeTry, type ResultAsync } from 'neverthrow';
import { generationRun, type GenerationRun, runEvent, type RunEvent } from '$lib/server/db/schema';
import type { DbError } from '$lib/server/errors/db';
import { DbInternalError } from '$lib/server/errors/db';
import { unwrapSingleQueryResult } from '$lib/server/db/utils';
import { db, eq, runSerializedWrite } from '$lib/server/db/runtime';

export function createGenerationRun({
	run
}: {
	run: GenerationRun;
}): ResultAsync<GenerationRun, DbError> {
	return safeTry(async function* () {
		const rows = yield* fromPromise(
			runSerializedWrite(() => db.insert(generationRun).values(run).returning()),
			(error) => new DbInternalError({ cause: error })
		);
		return unwrapSingleQueryResult(rows, run.id, 'GenerationRun');
	});
}

export function getGenerationRunById({ id }: { id: string }): ResultAsync<GenerationRun, DbError> {
	return safeTry(async function* () {
		const rows = yield* fromPromise(
			db.select().from(generationRun).where(eq(generationRun.id, id)),
			(error) => new DbInternalError({ cause: error })
		);
		return unwrapSingleQueryResult(rows, id, 'GenerationRun');
	});
}

export function getGenerationRunsByChatId({
	chatId
}: {
	chatId: string;
}): ResultAsync<GenerationRun[], DbError> {
	return fromPromise(
		db
			.select()
			.from(generationRun)
			.where(eq(generationRun.chatId, chatId))
			.orderBy(asc(generationRun.createdAt)),
		(error) => new DbInternalError({ cause: error })
	);
}

export function getActiveGenerationRunByChatId({
	chatId,
	userId
}: {
	chatId: string;
	userId: string;
}): ResultAsync<GenerationRun | null, DbError> {
	return safeTry(async function* () {
		const rows = yield* fromPromise(
			db
				.select()
				.from(generationRun)
				.where(
					and(
						eq(generationRun.chatId, chatId),
						eq(generationRun.userId, userId),
						or(eq(generationRun.status, 'queued'), eq(generationRun.status, 'running'))
					)
				)
				.orderBy(desc(generationRun.createdAt))
				.limit(1),
			(error) => new DbInternalError({ cause: error })
		);
		return ok(rows[0] ?? null);
	});
}

export function updateGenerationRunStatus({
	runId,
	status,
	error
}: {
	runId: string;
	status: string;
	error?: string | null;
}): ResultAsync<undefined, DbError> {
	return safeTry(async function* () {
		yield* fromPromise(
			runSerializedWrite(() =>
				db
					.update(generationRun)
					.set({
						status,
						error: error ?? null,
						startedAt: status === 'running' ? new Date() : undefined,
						finishedAt:
							status === 'succeeded' || status === 'failed' || status === 'canceled'
								? new Date()
								: undefined
					})
					.where(eq(generationRun.id, runId))
			),
			(error) => new DbInternalError({ cause: error })
		);
		return ok(undefined);
	});
}

export function appendRunEvent({
	runId,
	chunkJson
}: {
	runId: string;
	chunkJson: string;
}): ResultAsync<RunEvent, DbError> {
	return safeTry(async function* () {
		const event = yield* fromPromise(
			runSerializedWrite(() =>
				db.transaction(async (tx) => {
					const runRows = await tx
						.select({ cursor: generationRun.cursor })
						.from(generationRun)
						.where(eq(generationRun.id, runId))
						.limit(1);
					const currentCursor = runRows[0]?.cursor ?? 0;
					const nextSeq = currentCursor + 1;

					await tx
						.update(generationRun)
						.set({ cursor: nextSeq })
						.where(eq(generationRun.id, runId));
					const inserted = await tx
						.insert(runEvent)
						.values({
							runId,
							seq: nextSeq,
							createdAt: new Date(),
							chunk: chunkJson
						})
						.returning();
					return inserted[0] ?? null;
				})
			),
			(error) => new DbInternalError({ cause: error })
		);

		if (!event) {
			return err(new DbInternalError({ cause: new Error('Failed to append run event') }));
		}

		return ok(event);
	});
}

export function getRunEventsAfterSeq({
	runId,
	afterSeq
}: {
	runId: string;
	afterSeq: number;
}): ResultAsync<RunEvent[], DbError> {
	return safeTry(async function* () {
		const rows = yield* fromPromise(
			db
				.select()
				.from(runEvent)
				.where(and(eq(runEvent.runId, runId), gte(runEvent.seq, afterSeq + 1)))
				.orderBy(asc(runEvent.seq)),
			(error) => new DbInternalError({ cause: error })
		);
		return ok(rows);
	});
}

export function getActiveRunChatIdsByUserId({
	userId
}: {
	userId: string;
}): ResultAsync<string[], DbError> {
	return safeTry(async function* () {
		const rows = yield* fromPromise(
			db
				.select({ chatId: generationRun.chatId })
				.from(generationRun)
				.where(
					and(
						eq(generationRun.userId, userId),
						or(eq(generationRun.status, 'queued'), eq(generationRun.status, 'running'))
					)
				),
			(error) => new DbInternalError({ cause: error })
		);
		const uniq = new Set(rows.map((row) => row.chatId));
		return ok([...uniq]);
	});
}

export function failAllActiveGenerationRuns({
	errorKey
}: {
	errorKey?: string | null;
} = {}): ResultAsync<number, DbError> {
	return safeTry(async function* () {
		const ids = yield* fromPromise(
			db
				.select({ id: generationRun.id })
				.from(generationRun)
				.where(or(eq(generationRun.status, 'queued'), eq(generationRun.status, 'running'))),
			(error) => new DbInternalError({ cause: error })
		);

		const runIds = ids
			.map((row) => row.id)
			.filter((id): id is string => typeof id === 'string' && id.length > 0);
		if (runIds.length === 0) return ok(0);

		yield* fromPromise(
			runSerializedWrite(() =>
				db
					.update(generationRun)
					.set({
						status: 'failed',
						error: errorKey ?? 'run.failed',
						finishedAt: new Date()
					})
					.where(inArray(generationRun.id, runIds))
			),
			(error) => new DbInternalError({ cause: error })
		);

		return ok(runIds.length);
	});
}
