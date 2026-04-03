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

	it('does not duplicate reasoning when an event contains both snapshot metadata and delta', () => {
		const parts = aggregateRunEventsToParts([
			{
				chunk: JSON.stringify({ type: 'reasoning-start' })
			},
			{
				chunk: JSON.stringify({
					type: 'reasoning-delta',
					delta: 'User',
					providerMetadata: {
						openrouter: {
							reasoning_details: [{ text: 'User' }]
						}
					}
				})
			},
			{
				chunk: JSON.stringify({
					type: 'reasoning-delta',
					delta: ' asks why',
					providerMetadata: {
						openrouter: {
							reasoning_details: [{ text: 'User asks why' }]
						}
					}
				})
			}
		]);

		expect(parts).toEqual([{ type: 'reasoning', text: 'User asks why' }]);
	});

	it('keeps full reasoning when OpenRouter metadata contains only the current fragment', () => {
		const parts = aggregateRunEventsToParts([
			{
				chunk: JSON.stringify({
					type: 'reasoning-start',
					providerMetadata: {
						openrouter: {
							reasoning_details: [{ text: 'User' }]
						}
					}
				})
			},
			{
				chunk: JSON.stringify({
					type: 'reasoning-delta',
					delta: 'User',
					providerMetadata: {
						openrouter: {
							reasoning_details: [{ text: 'User' }]
						}
					}
				})
			},
			{
				chunk: JSON.stringify({
					type: 'reasoning-delta',
					delta: ' asks',
					providerMetadata: {
						openrouter: {
							reasoning_details: [{ text: ' asks' }]
						}
					}
				})
			},
			{
				chunk: JSON.stringify({
					type: 'reasoning-delta',
					delta: ' politely',
					providerMetadata: {
						openrouter: {
							reasoning_details: [{ text: ' politely' }]
						}
					}
				})
			}
		]);

		expect(parts).toEqual([{ type: 'reasoning', text: 'User asks politely' }]);
	});
});
