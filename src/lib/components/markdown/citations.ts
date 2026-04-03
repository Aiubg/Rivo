import type { CitationSource } from '$lib/utils/citations';

const COMMON_SECOND_LEVEL_LABELS = new Set(['ac', 'co', 'com', 'edu', 'gov', 'net', 'org']);

export function buildCitationMap(
	citations: ReadonlyArray<CitationSource>
): Record<number, CitationSource> {
	const map: Record<number, CitationSource> = {};
	for (const citation of citations) {
		map[citation.id] = citation;
	}
	return map;
}

export function resolveCitationFromMap(
	citationMap: Record<number, CitationSource>,
	href: unknown
): CitationSource | null {
	if (typeof href !== 'string' || !href.startsWith('cite:')) {
		return null;
	}

	const id = Number(href.slice(5));
	if (!Number.isFinite(id)) {
		return null;
	}

	return citationMap[Math.trunc(id)] ?? null;
}

export function isCitationHref(href: unknown): boolean {
	return typeof href === 'string' && href.startsWith('cite:');
}

export function toSourceLabel(hostname: string): string {
	const cleaned = hostname.replace(/^www\./i, '').toLowerCase();
	const parts = cleaned.split('.').filter(Boolean);
	if (parts.length === 0) return '';
	if (parts.length === 1) return parts[0] ?? '';

	const tld = parts[parts.length - 1] ?? '';
	const secondLevel = parts[parts.length - 2] ?? '';
	if (tld.length === 2 && COMMON_SECOND_LEVEL_LABELS.has(secondLevel) && parts.length >= 3) {
		return parts[parts.length - 3] ?? secondLevel;
	}

	return secondLevel;
}

export function parseCitationMeta(url: string | undefined) {
	if (!url) {
		return {
			hostname: '',
			faviconUrl: '',
			sourceLabel: ''
		};
	}

	try {
		const hostname = new URL(url).hostname;
		return {
			hostname,
			faviconUrl: `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`,
			sourceLabel: toSourceLabel(hostname)
		};
	} catch {
		const hostCandidate = url.replace(/^[a-z]+:\/\//i, '').split('/')[0] ?? '';
		return {
			hostname: hostCandidate || url,
			faviconUrl: '',
			sourceLabel: toSourceLabel(hostCandidate)
		};
	}
}

export function formatCitationPublishedAt(value: string | undefined): string {
	if (!value) return '';

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return '';
	}

	return new Intl.DateTimeFormat(undefined, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(parsed);
}
