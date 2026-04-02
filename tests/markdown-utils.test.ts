import { describe, expect, it } from 'vitest';
import {
	getMarkdownHighlightPlan,
	markdownNeedsHighlight,
	markdownNeedsMath,
	normalizeMarkdownCodeLanguage
} from '$lib/utils/markdown';

describe('markdown utils', () => {
	it('detects highlight need', () => {
		expect(markdownNeedsHighlight('plain')).toBe(false);
		expect(markdownNeedsHighlight('```ts\nconst x = 1\n```')).toBe(true);
	});

	it('detects math need', () => {
		expect(markdownNeedsMath('plain')).toBe(false);
		expect(markdownNeedsMath('$x$')).toBe(true);
		expect(markdownNeedsMath('$$x$$')).toBe(true);
		expect(markdownNeedsMath('\\$x\\$')).toBe(false);
	});

	it('normalizes markdown code fence languages', () => {
		expect(normalizeMarkdownCodeLanguage('ts')).toBe('typescript');
		expect(normalizeMarkdownCodeLanguage('language-js')).toBe('javascript');
		expect(normalizeMarkdownCodeLanguage('{.yml}')).toBe('yaml');
		expect(normalizeMarkdownCodeLanguage('unknown')).toBeNull();
	});

	it('builds a highlight plan from fenced code blocks', () => {
		expect(
			getMarkdownHighlightPlan(
				[
					'```ts',
					'const x = 1;',
					'```',
					'```',
					'echo hello',
					'```',
					'```mermaid',
					'graph TD',
					'```'
				].join('\n')
			)
		).toEqual({
			languages: ['typescript', 'mermaid'],
			hasUnlabeledCodeBlocks: true
		});
	});
});
