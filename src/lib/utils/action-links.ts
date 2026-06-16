import { transformMarkdownOutsideCodeFences, WORD_JOINER } from '$lib/utils/markdown-transform';

/** Custom link scheme used to carry assistant-driven actions through markdown. */
export const ACTION_SCHEME = 'action:';

/** Known action types. Extend this union when adding new action kinds. */
export type ActionType = 'ask';

export type ParsedAction = {
	type: string;
	payload: string;
};

const ACTION_ASK_RE = /\[\[ask:([\s\S]+?)\]\]/g;

/** Escapes characters that would break a markdown link label `[ ... ]`. */
function escapeLinkLabel(text: string): string {
	return text.replace(/[\\[\]]/g, (ch) => `\\${ch}`);
}

/**
 * Percent-encodes a payload for use inside a markdown link target `( ... )`.
 * `encodeURIComponent` leaves parentheses intact, which would prematurely close
 * the markdown link, so encode them explicitly.
 */
function encodePayload(text: string): string {
	return encodeURIComponent(text).replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/**
 * Converts assistant action markers into markdown links using the custom
 * `action:` scheme, skipping fenced code blocks. The payload is percent-encoded
 * so arbitrary text survives markdown parsing.
 *
 * Syntax:
 * - `[[ask:question]]` — the displayed chip text and the sent message are the same.
 * - `[[ask:label|question]]` — the chip shows `label` but sends `question`.
 */
export function convertActionMarkersToMarkdownLinks(md: string): string {
	return transformMarkdownOutsideCodeFences(md, (segment) =>
		segment.replace(ACTION_ASK_RE, (_, raw: string) => {
			const trimmed = raw.trim();
			if (!trimmed) return '';

			const pipeIndex = trimmed.indexOf('|');
			const label = pipeIndex >= 0 ? trimmed.slice(0, pipeIndex).trim() : trimmed;
			const payload = pipeIndex >= 0 ? trimmed.slice(pipeIndex + 1).trim() : trimmed;
			if (!payload) return '';

			const displayLabel = escapeLinkLabel(label || payload);
			return `${WORD_JOINER}[${displayLabel}](${ACTION_SCHEME}ask:${encodePayload(payload)})`;
		})
	);
}

/** Returns true when the href uses the custom action scheme. */
export function isActionHref(href: unknown): boolean {
	return typeof href === 'string' && href.startsWith(ACTION_SCHEME);
}

/**
 * Parses an `action:<type>:<encoded payload>` href into its type and decoded
 * payload. Returns null for non-action hrefs or malformed values.
 */
export function parseActionHref(href: unknown): ParsedAction | null {
	if (typeof href !== 'string' || !href.startsWith(ACTION_SCHEME)) {
		return null;
	}

	const rest = href.slice(ACTION_SCHEME.length);
	const separatorIndex = rest.indexOf(':');
	if (separatorIndex <= 0) {
		return null;
	}

	const type = rest.slice(0, separatorIndex);
	const encodedPayload = rest.slice(separatorIndex + 1);

	let payload: string;
	try {
		payload = decodeURIComponent(encodedPayload);
	} catch {
		payload = encodedPayload;
	}

	if (!payload) return null;

	return { type, payload };
}
