import { SvelteMap } from 'svelte/reactivity';
import { canResumeRun, getNextRunResumeState, type RunResumeState } from './run-stream';

type ScheduleRunResumeOptions = {
	runId: string;
	assistantMessageId: string;
	cursor: number;
	errorKey: string;
	delayMs: number;
};

type RunResumeSchedulerDependencies = {
	onResume(options: { id: string; assistantMessageId: string; cursor: number }): void;
	onLimitReached(options: { runId: string; cursor: number; state: RunResumeState }): void;
	onSchedule(options: {
		runId: string;
		cursor: number;
		errorKey: string;
		delayMs: number;
		state: RunResumeState;
	}): void;
};

export class RunResumeScheduler {
	private readonly states = new SvelteMap<string, RunResumeState>();
	private readonly timeouts = new SvelteMap<string, ReturnType<typeof setTimeout>>();

	constructor(private readonly deps: RunResumeSchedulerDependencies) {}

	getState(runId: string): RunResumeState | undefined {
		return this.states.get(runId);
	}

	clearRecoveryState(runId: string | null | undefined): void {
		if (!runId) return;
		this.clearPending(runId);
		this.states.delete(runId);
	}

	clearPending(runId?: string | null): void {
		if (runId) {
			const timeoutId = this.timeouts.get(runId);
			if (timeoutId) {
				clearTimeout(timeoutId);
				this.timeouts.delete(runId);
			}
			return;
		}

		for (const timeoutId of this.timeouts.values()) {
			clearTimeout(timeoutId);
		}
		this.timeouts.clear();
	}

	reset(): void {
		this.clearPending();
		this.states.clear();
	}

	schedule(options: ScheduleRunResumeOptions): boolean {
		const nextState = getNextRunResumeState(this.states.get(options.runId), options.errorKey);

		if (!canResumeRun(nextState)) {
			this.clearPending(options.runId);
			this.states.delete(options.runId);
			this.deps.onLimitReached({
				runId: options.runId,
				cursor: options.cursor,
				state: nextState
			});
			return false;
		}

		this.states.set(options.runId, nextState);
		this.deps.onSchedule({
			runId: options.runId,
			cursor: options.cursor,
			errorKey: options.errorKey,
			delayMs: options.delayMs,
			state: nextState
		});

		this.clearPending(options.runId);
		const timeoutId = setTimeout(() => {
			this.timeouts.delete(options.runId);
			this.deps.onResume({
				id: options.runId,
				assistantMessageId: options.assistantMessageId,
				cursor: options.cursor
			});
		}, options.delayMs);
		this.timeouts.set(options.runId, timeoutId);

		return true;
	}
}
