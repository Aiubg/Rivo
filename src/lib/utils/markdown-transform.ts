export const FENCED_CODE_BLOCK_RE = /```[\s\S]*?```/g;

/** Zero-width word joiner used to keep injected links from gluing onto adjacent text. */
export const WORD_JOINER = '⁠';

/**
 * Applies `transform` to every segment of `md` that lies outside fenced code
 * blocks, leaving the code blocks untouched.
 */
export function transformMarkdownOutsideCodeFences(
	md: string,
	transform: (segment: string) => string
): string {
	if (!md) return '';
	let out = '';
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	FENCED_CODE_BLOCK_RE.lastIndex = 0;
	while ((match = FENCED_CODE_BLOCK_RE.exec(md)) !== null) {
		const blockStart = match.index;
		const blockText = match[0] ?? '';
		out += transform(md.slice(lastIndex, blockStart));
		out += blockText;
		lastIndex = blockStart + blockText.length;
	}
	out += transform(md.slice(lastIndex));
	return out;
}
