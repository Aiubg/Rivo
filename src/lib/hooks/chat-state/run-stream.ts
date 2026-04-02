export const STREAM_CONNECT_TIMEOUT_MS = 10_000;
export const STREAM_CONNECT_MAX_ATTEMPTS = 3;
export const MAX_RUN_RESUME_ATTEMPTS = 6;
export const MAX_RUN_RESUME_WINDOW_MS = 60_000;

export type RunResumeState = {
	count: number;
	startedAt: number;
	lastError: string;
};

export function getRunCursorStorageKey(runId: string): string {
	return `run_cursor_${runId}`;
}

export function readStoredRunCursor(runId: string, fallback = 0): number {
	if (typeof window === 'undefined') {
		return fallback;
	}

	const rawValue = Number(localStorage.getItem(getRunCursorStorageKey(runId)) ?? String(fallback));
	return Number.isFinite(rawValue) && rawValue >= 0 ? rawValue : fallback;
}

export function persistStoredRunCursor(runId: string, cursor: number): void {
	if (typeof window === 'undefined' || !Number.isFinite(cursor) || cursor < 0) {
		return;
	}

	localStorage.setItem(getRunCursorStorageKey(runId), String(cursor));
}

export function clearStoredRunCursor(runId: string): void {
	if (typeof window === 'undefined') {
		return;
	}

	localStorage.removeItem(getRunCursorStorageKey(runId));
}

export function getStreamReconnectDelay(attempt: number): number {
	return Math.pow(2, attempt) * 500;
}

export function shouldTriggerCommitFromRecordType(type?: string): boolean {
	return (
		type === 'text-start' ||
		type === 'text-delta' ||
		type === 'text-end' ||
		type === 'reasoning-start' ||
		type === 'reasoning-delta' ||
		type === 'tool-input-start' ||
		type === 'tool-input-delta' ||
		type === 'tool-input-available' ||
		type === 'tool-output-available'
	);
}

export function getNextRunResumeState(
	previous: RunResumeState | undefined,
	errorKey: string
): RunResumeState {
	return {
		count: (previous?.count ?? 0) + 1,
		startedAt: previous?.startedAt ?? Date.now(),
		lastError: errorKey
	};
}

export function canResumeRun(state: RunResumeState, now = Date.now()): boolean {
	return (
		state.count <= MAX_RUN_RESUME_ATTEMPTS && now - state.startedAt <= MAX_RUN_RESUME_WINDOW_MS
	);
}

export async function readStreamErrorMessage(
	response: Response,
	fallback = 'run.stream_failed'
): Promise<string> {
	let errorKey = fallback;
	try {
		const rawText = await response.text();
		if (rawText) {
			try {
				const parsed = JSON.parse(rawText) as { message?: unknown };
				if (parsed && typeof parsed.message === 'string') {
					errorKey = parsed.message;
				} else {
					errorKey = rawText;
				}
			} catch {
				errorKey = rawText;
			}
		}
	} catch {
		// ignore
	}

	return errorKey;
}
