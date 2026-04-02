import { describe, expect, it } from 'vitest';
import { buildSearchSnippet, extractSearchTextFromParts } from '$lib/utils/chat';

describe('chat search text helpers', () => {
	it('extracts searchable text from text, reasoning, and tool payloads', () => {
		const searchText = extractSearchTextFromParts([
			{ type: 'text', text: 'Alpha report' },
			{ type: 'reasoning', text: 'Need to inspect beta data' },
			{
				type: 'tool-invocation',
				toolInvocation: {
					state: 'result',
					toolCallId: 'tool-1',
					toolName: 'tavily_search',
					args: { query: 'Gamma market' },
					result: { answer: 'Delta signal' }
				}
			}
		]);

		expect(searchText).toContain('Alpha report');
		expect(searchText).toContain('beta data');
		expect(searchText).toContain('tavily_search');
		expect(searchText).toContain('Gamma market');
		expect(searchText).toContain('Delta signal');
	});

	it('builds a centered snippet around the search query', () => {
		const snippet = buildSearchSnippet(
			'one two three four five six seven eight nine ten eleven twelve thirteen fourteen',
			'eight',
			24
		);

		expect(snippet).toContain('eight');
		expect(snippet.startsWith('...')).toBe(true);
	});
});
