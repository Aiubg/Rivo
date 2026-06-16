import { describe, expect, it } from 'vitest';
import {
	ACTION_SCHEME,
	convertActionMarkersToMarkdownLinks,
	isActionHref,
	parseActionHref
} from '$lib/utils/action-links';

const WORD_JOINER = '⁠';

describe('action-links utils', () => {
	it('converts ask markers into action-scheme links outside code fences', () => {
		const input = [
			'Here is help.',
			'[[ask:How do I deploy this?]]',
			'```md',
			'[[ask:should stay literal]]',
			'```'
		].join('\n');

		const out = convertActionMarkersToMarkdownLinks(input);
		expect(out).toContain(
			`${WORD_JOINER}[How do I deploy this?](action:ask:${encodeURIComponent('How do I deploy this?')})`
		);
		expect(out).toContain('[[ask:should stay literal]]');
	});

	it('trims surrounding whitespace and drops empty markers', () => {
		expect(convertActionMarkersToMarkdownLinks('[[ask:   ]]')).toBe('');
		const out = convertActionMarkersToMarkdownLinks('[[ask:  spaced  ]]');
		expect(out).toContain(`action:ask:${encodeURIComponent('spaced')}`);
	});

	it('supports a separate display label and sent payload via the pipe syntax', () => {
		const out = convertActionMarkersToMarkdownLinks('[[ask:More detail|Explain step 3 in depth]]');
		expect(out).toContain(
			`${WORD_JOINER}[More detail](action:ask:${encodeURIComponent('Explain step 3 in depth')})`
		);

		const hrefMatch = out.match(/\]\((action:ask:[^)]+)\)/);
		expect(parseActionHref(hrefMatch?.[1])).toEqual({
			type: 'ask',
			payload: 'Explain step 3 in depth'
		});
	});

	it('falls back to the payload as label when the label side is empty', () => {
		const out = convertActionMarkersToMarkdownLinks('[[ask:|just send this]]');
		expect(out).toContain(
			`${WORD_JOINER}[just send this](action:ask:${encodeURIComponent('just send this')})`
		);
	});

	it('escapes brackets in the markdown label but round-trips the payload', () => {
		const question = 'What about arr[0] and (parens)?';
		const out = convertActionMarkersToMarkdownLinks(`[[ask:${question}]]`);

		// Label brackets are escaped so markdown parsing is not broken.
		expect(out).toContain('arr\\[0\\]');

		// Extract the href and confirm the decoded payload matches the original text.
		const hrefMatch = out.match(/\]\((action:ask:[^)]+)\)/);
		expect(hrefMatch).not.toBeNull();
		const parsed = parseActionHref(hrefMatch?.[1]);
		expect(parsed).toEqual({ type: 'ask', payload: question });
	});

	it('round-trips payloads containing newlines and unicode', () => {
		const question = '这个怎么解决？\nNeed help';
		const href = `${ACTION_SCHEME}ask:${encodeURIComponent(question)}`;
		expect(parseActionHref(href)).toEqual({ type: 'ask', payload: question });
	});

	it('isActionHref distinguishes schemes', () => {
		expect(isActionHref('action:ask:hi')).toBe(true);
		expect(isActionHref('cite:1')).toBe(false);
		expect(isActionHref('https://example.com')).toBe(false);
		expect(isActionHref(undefined)).toBe(false);
	});

	it('parseActionHref returns null for non-action or malformed hrefs', () => {
		expect(parseActionHref('https://example.com')).toBeNull();
		expect(parseActionHref('cite:1')).toBeNull();
		expect(parseActionHref('action:ask:')).toBeNull();
		expect(parseActionHref('action:nopayload')).toBeNull();
		expect(parseActionHref(42)).toBeNull();
	});

	it('preserves unknown action types so the renderer can fall back', () => {
		const parsed = parseActionHref('action:future:payload');
		expect(parsed).toEqual({ type: 'future', payload: 'payload' });
	});
});
