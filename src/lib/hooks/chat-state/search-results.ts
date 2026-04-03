import type { SearchResult } from '$lib/hooks/search-sidebar.svelte';
import type { UIMessageWithTree } from '$lib/types/message';

export function getChatSearchResults(messages: ReadonlyArray<UIMessageWithTree>): SearchResult[] {
	const results: SearchResult[] = [];
	const seenUrls = new Set<string>();

	for (const message of messages) {
		for (const part of message.parts ?? []) {
			const resultObj = part.toolInvocation?.result ?? part.output;
			if (
				(part.toolInvocation?.toolName === 'tavily_search' || part.toolName === 'tavily_search') &&
				resultObj &&
				typeof resultObj === 'object' &&
				'results' in resultObj &&
				Array.isArray((resultObj as { results?: unknown[] }).results)
			) {
				for (const result of (resultObj as { results: SearchResult[] }).results) {
					if (result?.url && !seenUrls.has(result.url)) {
						results.push(result);
						seenUrls.add(result.url);
					}
				}
			}
		}
	}

	return results;
}
