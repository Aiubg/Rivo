import { afterEach, describe, expect, it } from 'vitest';
import { getRunRecoveryStaleAfterMs } from '$lib/server/ai/run-recovery';
import { isGenerationRunStaleForRecovery } from '$lib/server/db/run-queries';

describe('run recovery', () => {
	afterEach(() => {
		delete process.env.RUN_RECOVERY_STALE_AFTER_MS;
	});

	it('only treats active runs older than the recovery cutoff as stale', () => {
		const cutoff = new Date('2026-01-01T00:30:00.000Z');

		expect(
			isGenerationRunStaleForRecovery(
				{
					id: 'queued-old',
					status: 'queued',
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					startedAt: null
				},
				cutoff
			)
		).toBe(true);

		expect(
			isGenerationRunStaleForRecovery(
				{
					id: 'running-new',
					status: 'running',
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					startedAt: new Date('2026-01-01T00:31:00.000Z')
				},
				cutoff
			)
		).toBe(false);
	});

	it('ignores unsafe recovery timeout overrides', () => {
		process.env.RUN_RECOVERY_STALE_AFTER_MS = '1';
		expect(getRunRecoveryStaleAfterMs()).toBe(30 * 60 * 1000);

		process.env.RUN_RECOVERY_STALE_AFTER_MS = '120000';
		expect(getRunRecoveryStaleAfterMs()).toBe(120000);
	});
});
