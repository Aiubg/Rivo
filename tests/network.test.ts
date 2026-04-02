import { describe, expect, it } from 'vitest';
import { combineAbortSignals } from '$lib/utils/network';

describe('combineAbortSignals', () => {
	it('returns the only provided signal', () => {
		const controller = new AbortController();

		expect(combineAbortSignals(controller.signal)).toBe(controller.signal);
	});

	it('falls back when AbortSignal.any is unavailable', () => {
		const originalDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'any');
		const first = new AbortController();
		const second = new AbortController();

		Object.defineProperty(AbortSignal, 'any', {
			value: undefined,
			configurable: true,
			writable: true
		});

		try {
			const combined = combineAbortSignals(first.signal, second.signal);

			expect(combined).toBeDefined();
			expect(combined?.aborted).toBe(false);

			second.abort();

			expect(combined?.aborted).toBe(true);
		} finally {
			if (originalDescriptor) {
				Object.defineProperty(AbortSignal, 'any', originalDescriptor);
			}
		}
	});
});
