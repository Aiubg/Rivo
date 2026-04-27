import { failStaleGenerationRuns } from '$lib/server/db/queries';
import { logger } from '$lib/utils/logger';

const DEFAULT_RUN_RECOVERY_STALE_AFTER_MS = 30 * 60 * 1000;
const MIN_RUN_RECOVERY_STALE_AFTER_MS = 60 * 1000;

let recoveryPromise: Promise<void> | null = null;

export function getRunRecoveryStaleAfterMs(): number {
	const raw = process.env.RUN_RECOVERY_STALE_AFTER_MS;
	if (!raw) return DEFAULT_RUN_RECOVERY_STALE_AFTER_MS;

	const value = Number.parseInt(raw, 10);
	if (!Number.isFinite(value) || value < MIN_RUN_RECOVERY_STALE_AFTER_MS) {
		return DEFAULT_RUN_RECOVERY_STALE_AFTER_MS;
	}
	return value;
}

export function ensureRunRecovery() {
	if (recoveryPromise) return recoveryPromise;
	recoveryPromise = (async () => {
		const staleAfterMs = getRunRecoveryStaleAfterMs();
		const staleBefore = new Date(Date.now() - staleAfterMs);
		const res = await failStaleGenerationRuns({
			staleBefore,
			errorKey: 'run.failed'
		});
		if (res.isErr()) {
			logger.error('Failed to recover generation runs', res.error);
			return;
		}
		if (res.value > 0) {
			logger.info('Recovered stale generation runs', { count: res.value, staleAfterMs });
		}
	})();
	return recoveryPromise;
}
