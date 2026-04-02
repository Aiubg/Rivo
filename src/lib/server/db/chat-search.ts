import { buildSearchSnippet } from '$lib/utils/chat';

export type ChatSearchRow = {
	chatId: string;
	chatTitle: string;
	messageId: string | null;
	messageSearchText: string | null;
	createdAt: Date | null;
	updatedAt: Date;
};

export type ChatSearchResultRow = {
	chatId: string;
	chatTitle: string;
	messageId?: string;
	messageSnippet: string;
	createdAt: Date;
};

function includesSearchTerm(value: string, normalizedQuery: string): boolean {
	return value.toLocaleLowerCase().includes(normalizedQuery);
}

export function mapChatSearchResults(
	rows: ReadonlyArray<ChatSearchRow>,
	query: string
): ChatSearchResultRow[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) {
		return [];
	}

	const chatsWithMessageMatches = new Set(
		rows
			.filter((row) => includesSearchTerm(row.messageSearchText ?? '', normalizedQuery))
			.map((row) => row.chatId)
	);

	const seen = new Set<string>();
	const results: ChatSearchResultRow[] = [];

	for (const row of rows) {
		const messageSearchText = row.messageSearchText ?? '';
		const titleMatches = includesSearchTerm(row.chatTitle, normalizedQuery);
		const messageMatches = includesSearchTerm(messageSearchText, normalizedQuery);
		if (!titleMatches && !messageMatches) {
			continue;
		}
		if (!messageMatches && chatsWithMessageMatches.has(row.chatId)) {
			continue;
		}

		const dedupeKey =
			messageMatches && row.messageId ? `message:${row.messageId}` : `chat:${row.chatId}`;
		if (seen.has(dedupeKey)) {
			continue;
		}
		seen.add(dedupeKey);

		results.push({
			chatId: row.chatId,
			chatTitle: row.chatTitle,
			messageId: messageMatches ? (row.messageId ?? undefined) : undefined,
			messageSnippet: messageMatches
				? buildSearchSnippet(messageSearchText, query, 240)
				: buildSearchSnippet(row.chatTitle, query, 120),
			createdAt: messageMatches ? (row.createdAt ?? row.updatedAt) : row.updatedAt
		});
	}

	return results;
}
