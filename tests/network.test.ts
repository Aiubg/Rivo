import { describe, expect, it } from 'vitest';
import { combineAbortSignals } from '$lib/utils/network';

describe('combineAbortSignals', () => {
	it('returns undefined when no usable signal is provided', () => {
		expect(combineAbortSignals()).toBeUndefined();
		expect(combineAbortSignals(null, undefined)).toBeUndefined();
	});

	it('returns the only provided signal', () => {
		const controller = new AbortController();

		expect(combineAbortSignals(controller.signal)).toBe(controller.signal);
	});

	it('aborts the combined signal when any input aborts', () => {
		const first = new AbortController();
		const second = new AbortController();

		const combined = combineAbortSignals(first.signal, second.signal);

		expect(combined).toBeDefined();
		expect(combined?.aborted).toBe(false);

		second.abort();

		expect(combined?.aborted).toBe(true);
	});
});
