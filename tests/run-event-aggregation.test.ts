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
});
