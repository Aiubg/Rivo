import { describe, expect, it } from 'vitest';
import { aggregateRunEventsToParts } from '$lib/server/ai/utils';

describe('aggregateRunEventsToParts', () => {
	it('reconstructs reasoning emitted via provider metadata snapshots', () => {
		const parts = aggregateRunEventsToParts([
			{
				chunk: JSON.stringify({ type: 'reasoning-start' })
			},
			{
				chunk: JSON.stringify({
					providerMetadata: {
						openrouter: {
							reasoning_details: [{ text: 'Need to inspect' }]
						}
					}
				})
			},
			{
				chunk: JSON.stringify({
					providerMetadata: {
						openrouter: {
							reasoning_details: [{ text: 'Need to inspect more carefully' }]
						}
					}
				})
			}
		]);

		expect(parts).toEqual([{ type: 'reasoning', text: 'Need to inspect more carefully' }]);
	});

	it('prefers reasoning snapshots over duplicate deltas in the same event', () => {
		const parts = aggregateRunEventsToParts([
			{
				chunk: JSON.stringify({ type: 'reasoning-start' })
			},
			{
				chunk: JSON.stringify({
					type: 'reasoning-delta',
					delta: '用户',
					providerMetadata: {
						openrouter: {
							reasoning_details: [{ text: '用户' }]
						}
					}
				})
			},
			{
				chunk: JSON.stringify({
					type: 'reasoning-delta',
					delta: '中文问',
					providerMetadata: {
						openrouter: {
							reasoning_details: [{ text: '用户中文问' }]
						}
					}
				})
			}
		]);

		expect(parts).toEqual([{ type: 'reasoning', text: '用户中文问' }]);
	});
});
