import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunResumeScheduler } from '$lib/hooks/chat-state/run-resume-scheduler';
import { MAX_RUN_RESUME_ATTEMPTS } from '$lib/hooks/chat-state/run-stream';

describe('RunResumeScheduler', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('replaces an existing timeout when the same run is rescheduled', async () => {
		vi.useFakeTimers();
		const onResume = vi.fn();
		const onLimitReached = vi.fn();
		const onSchedule = vi.fn();
		const scheduler = new RunResumeScheduler({
			onResume,
			onLimitReached,
			onSchedule
		});

		scheduler.schedule({
			runId: 'run-1',
			assistantMessageId: 'msg-1',
			cursor: 1,
			errorKey: 'run.stream_failed',
			delayMs: 100
		});
		scheduler.schedule({
			runId: 'run-1',
			assistantMessageId: 'msg-1',
			cursor: 2,
			errorKey: 'run.stream_failed',
			delayMs: 200
		});

		await vi.advanceTimersByTimeAsync(199);
		expect(onResume).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(onResume).toHaveBeenCalledTimes(1);
		expect(onResume).toHaveBeenCalledWith({
			id: 'run-1',
			assistantMessageId: 'msg-1',
			cursor: 2
		});
		expect(onSchedule).toHaveBeenCalledTimes(2);
		expect(onLimitReached).not.toHaveBeenCalled();
	});

	it('stops scheduling once the retry limit is exceeded', () => {
		vi.useFakeTimers();
		const onResume = vi.fn();
		const onLimitReached = vi.fn();
		const onSchedule = vi.fn();
		const scheduler = new RunResumeScheduler({
			onResume,
			onLimitReached,
			onSchedule
		});

		for (let attempt = 1; attempt <= MAX_RUN_RESUME_ATTEMPTS; attempt += 1) {
			expect(
				scheduler.schedule({
					runId: 'run-1',
					assistantMessageId: 'msg-1',
					cursor: attempt,
					errorKey: 'run.stream_failed',
					delayMs: 100
				})
			).toBe(true);
			scheduler.clearPending('run-1');
		}

		expect(
			scheduler.schedule({
				runId: 'run-1',
				assistantMessageId: 'msg-1',
				cursor: 999,
				errorKey: 'run.stream_failed',
				delayMs: 100
			})
		).toBe(false);
		expect(onLimitReached).toHaveBeenCalledTimes(1);
		expect(onResume).not.toHaveBeenCalled();
		expect(scheduler.getState('run-1')).toBeUndefined();
	});

	it('clears pending timers and state on reset', async () => {
		vi.useFakeTimers();
		const onResume = vi.fn();
		const scheduler = new RunResumeScheduler({
			onResume,
			onLimitReached: vi.fn(),
			onSchedule: vi.fn()
		});

		scheduler.schedule({
			runId: 'run-1',
			assistantMessageId: 'msg-1',
			cursor: 1,
			errorKey: 'run.stream_failed',
			delayMs: 100
		});
		scheduler.reset();

		await vi.advanceTimersByTimeAsync(100);
		expect(onResume).not.toHaveBeenCalled();
		expect(scheduler.getState('run-1')).toBeUndefined();
	});
});
