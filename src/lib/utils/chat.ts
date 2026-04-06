import type { Message as DBMessage, Chat } from '$lib/types/db';
import type { Attachment } from '$lib/types/attachment';
import type { UIMessageWithTree, MessagePart } from '$lib/types/message';
import { isToday, isYesterday, subMonths, subWeeks } from 'date-fns';

const MAX_SEARCH_TEXT_LENGTH = 10_000;
const ROOT_MESSAGE_PARENT_ID = 'root';

function normalizeWhitespace(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

function extractStringsFromValue(value: unknown, target: string[]): void {
	if (typeof value === 'string') {
		const normalized = normalizeWhitespace(value);
		if (normalized) {
			target.push(normalized);
		}
		return;
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		target.push(String(value));
		return;
	}

	if (!value || typeof value !== 'object') {
		return;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			extractStringsFromValue(item, target);
		}
		return;
	}

	for (const nestedValue of Object.values(value)) {
		extractStringsFromValue(nestedValue, target);
	}
}

export function extractSearchTextFromParts(parts: unknown): string {
	if (!Array.isArray(parts)) return '';

	const fragments: string[] = [];

	for (const part of parts as MessagePart[]) {
		if (!part || typeof part !== 'object') continue;

		if (
			(part.type === 'text' || part.type === 'reasoning') &&
			typeof part.text === 'string' &&
			part.text.trim() !== ''
		) {
			fragments.push(part.text);
		}

		if (typeof part.toolName === 'string' && part.toolName.trim() !== '') {
			fragments.push(part.toolName);
		}

		if (
			typeof part.toolInvocation?.toolName === 'string' &&
			part.toolInvocation.toolName.trim() !== ''
		) {
			fragments.push(part.toolInvocation.toolName);
		}

		extractStringsFromValue(part.input, fragments);
		extractStringsFromValue(part.output, fragments);
		extractStringsFromValue(part.toolInvocation?.args, fragments);
		extractStringsFromValue(part.toolInvocation?.result, fragments);
	}

	const combined = normalizeWhitespace(fragments.join(' '));
	if (combined.length <= MAX_SEARCH_TEXT_LENGTH) {
		return combined;
	}

	return combined.slice(0, MAX_SEARCH_TEXT_LENGTH);
}

export function buildSearchSnippet(text: string, query: string, maxLength = 240): string {
	const normalizedText = normalizeWhitespace(text);
	if (!normalizedText) return '';

	if (normalizedText.length <= maxLength) {
		return normalizedText;
	}

	const normalizedQuery = normalizeWhitespace(query).toLowerCase();
	const matchIndex =
		normalizedQuery.length > 0 ? normalizedText.toLowerCase().indexOf(normalizedQuery) : -1;

	if (matchIndex === -1) {
		return `${normalizedText.slice(0, maxLength)}...`;
	}

	const preferredStart = Math.max(0, matchIndex - Math.floor(maxLength / 3));
	const start = Math.min(preferredStart, Math.max(0, normalizedText.length - maxLength));
	const end = Math.min(normalizedText.length, start + maxLength);

	return `${start > 0 ? '...' : ''}${normalizedText.slice(start, end)}${end < normalizedText.length ? '...' : ''}`;
}

/**
 * Converts database messages to UI message format.
 */
export function convertToUIMessages(messages: Array<DBMessage>): UIMessageWithTree[] {
	return messages.map((message) => ({
		id: message.id,
		content: '',
		role: message.role,
		parts: message.parts as UIMessageWithTree['parts'],
		createdAt: message.createdAt,
		attachments: message.attachments,
		parentId: message.parentId
	}));
}

export type MessageTreeIndex = {
	byId: Map<string, UIMessageWithTree>;
	byParentId: Map<string, UIMessageWithTree[]>;
	idsByParentId: Map<string, string[]>;
	positionByParentId: Map<string, Map<string, number>>;
};

export function createMessageTreeIndex(
	messages: ReadonlyArray<UIMessageWithTree>
): MessageTreeIndex {
	const byId = new Map<string, UIMessageWithTree>();
	const byParentId = new Map<string, UIMessageWithTree[]>();
	const idsByParentId = new Map<string, string[]>();
	const positionByParentId = new Map<string, Map<string, number>>();

	for (const message of messages) {
		byId.set(message.id, message);
		const parentId = message.parentId || ROOT_MESSAGE_PARENT_ID;
		let siblings = byParentId.get(parentId);
		let siblingIds = idsByParentId.get(parentId);
		let positions = positionByParentId.get(parentId);

		if (!siblings) {
			siblings = [];
			byParentId.set(parentId, siblings);
		}
		if (!siblingIds) {
			siblingIds = [];
			idsByParentId.set(parentId, siblingIds);
		}
		if (!positions) {
			positions = new Map<string, number>();
			positionByParentId.set(parentId, positions);
		}

		positions.set(message.id, siblings.length);
		siblings.push(message);
		siblingIds.push(message.id);
	}

	return {
		byId,
		byParentId,
		idsByParentId,
		positionByParentId
	};
}

/**
 * Computes the default selected message IDs for each parent to form a path to the last message.
 */
export function computeDefaultSelectedMessageIds(
	messages: Array<UIMessageWithTree>
): Record<string, string> {
	if (messages.length === 0) return {};
	const newSelected: Record<string, string> = {};
	const { byId } = createMessageTreeIndex(messages);
	let current = messages[messages.length - 1];
	while (current) {
		const pid = current.parentId || ROOT_MESSAGE_PARENT_ID;
		if (!newSelected[pid]) {
			newSelected[pid] = current.id;
		}
		const currentParentId = current.parentId;
		if (!currentParentId) break;
		const parent = byId.get(currentParentId);
		if (!parent) break;
		current = parent;
	}
	return newSelected;
}

/**
 * Returns the path of messages from root to the end based on selected siblings.
 */
export function getMessagePathFromIndex(
	index: MessageTreeIndex,
	selectedMessageIds: Record<string, string>
): Array<UIMessageWithTree> {
	const path: Array<UIMessageWithTree> = [];
	let currentParentId = ROOT_MESSAGE_PARENT_ID;

	while (index.byParentId.has(currentParentId)) {
		const options = index.byParentId.get(currentParentId);
		if (!options || options.length === 0) break;
		const selectedId = selectedMessageIds[currentParentId];
		const selectedIndex =
			typeof selectedId === 'string'
				? index.positionByParentId.get(currentParentId)?.get(selectedId)
				: undefined;
		const selectedMessage =
			typeof selectedIndex === 'number' ? (options[selectedIndex] ?? options[0]) : options[0];
		if (!selectedMessage) break;
		path.push(selectedMessage);
		currentParentId = selectedMessage.id;
	}

	return path;
}

export function getMessagePath(
	messages: Array<UIMessageWithTree>,
	selectedMessageIds: Record<string, string>
): Array<UIMessageWithTree> {
	return getMessagePathFromIndex(createMessageTreeIndex(messages), selectedMessageIds);
}

function isUserMessage<T extends { role: string }>(message: T): message is T & { role: 'user' } {
	return message.role === 'user';
}

export function getUserMessages<T extends { role: string }>(
	messages: ReadonlyArray<T>
): Array<T & { role: 'user' }> {
	return messages.filter(isUserMessage);
}

export function resolveActiveUserMessageId<T extends { id: string; role: string }>(
	messages: ReadonlyArray<T>,
	activeMessageId: string | null
): string | null {
	if (!activeMessageId) return null;

	const activeIndex = messages.findIndex((message) => message.id === activeMessageId);
	if (activeIndex === -1) return null;

	for (let i = activeIndex; i >= 0; i -= 1) {
		const message = messages[i];
		if (message && isUserMessage(message)) {
			return message.id;
		}
	}

	return null;
}

/**
 * Finds the most recent message with 'user' role.
 */
export function getMostRecentUserMessage<T extends { role: string }>(
	messages: Array<T>
): (T & { role: 'user' }) | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message && isUserMessage(message)) {
			return message;
		}
	}
	return undefined;
}

/**
 * Type guard to check if a message has attachments.
 */
export function hasAttachments(
	m: UIMessageWithTree
): m is UIMessageWithTree & { attachments: Attachment[] } {
	return Array.isArray(m.attachments);
}

/**
 * Extracts all plain text content from a message's parts.
 */
export function extractTextFromMessage(message: UIMessageWithTree) {
	if (!message.parts) return '';
	try {
		return message.parts
			.map((part: MessagePart) => {
				if (part.type === 'text') {
					return part.text ?? '';
				}
				return '';
			})
			.filter(Boolean)
			.join('\n')
			.trim();
	} catch (_) {
		return '';
	}
}

/**
 * Gets a preview text for a message, prioritizing text parts then reasoning/tools.
 */
export function getMessagePreviewText(message: UIMessageWithTree) {
	const text = extractTextFromMessage(message);
	if (text) return text;

	if (!message.parts) return '';

	try {
		const parts = message.parts;
		for (const part of parts) {
			if (part.type === 'reasoning' && part.text) {
				return part.text;
			}
			if (part.type === 'tool-invocation' || part.type === 'dynamic-tool') {
				const toolName = part.toolName || part.toolInvocation?.toolName;
				if (toolName) return `[${toolName}]`;
			}
		}
	} catch (_) {
		// ignore
	}

	return '';
}

export type GroupedChats = {
	pinned: Chat[];
	today: Chat[];
	yesterday: Chat[];
	lastWeek: Chat[];
	lastMonth: Chat[];
	older: Chat[];
};

/**
 * Groups chats into time-based categories (Today, Yesterday, etc.)
 */
export function groupChatsByDate(chats: Chat[]): GroupedChats {
	const now = new Date();
	const oneWeekAgo = subWeeks(now, 1);
	const oneMonthAgo = subMonths(now, 1);

	const groups: GroupedChats = {
		pinned: [],
		today: [],
		yesterday: [],
		lastWeek: [],
		lastMonth: [],
		older: []
	};

	for (const chat of chats) {
		if (chat.pinned) {
			groups.pinned.push(chat);
			continue;
		}

		const chatDate = new Date(chat.updatedAt);

		if (isToday(chatDate)) {
			groups.today.push(chat);
		} else if (isYesterday(chatDate)) {
			groups.yesterday.push(chat);
		} else if (chatDate > oneWeekAgo) {
			groups.lastWeek.push(chat);
		} else if (chatDate > oneMonthAgo) {
			groups.lastMonth.push(chat);
		} else {
			groups.older.push(chat);
		}
	}

	// Sort each group by updatedAt descending
	for (const key in groups) {
		groups[key as keyof GroupedChats].sort(
			(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
		);
	}

	return groups;
}

/**
 * Enriches visible messages with sibling information for branching navigation.
 */
export function computeMessagesWithSiblings(
	messages: Array<UIMessageWithTree>,
	visibleMessages: Array<UIMessageWithTree>
) {
	return computeMessagesWithSiblingsFromIndex(createMessageTreeIndex(messages), visibleMessages);
}

export function computeMessagesWithSiblingsFromIndex(
	index: MessageTreeIndex,
	visibleMessages: Array<UIMessageWithTree>
) {
	return visibleMessages.map((message) => {
		const parentId = message.parentId || ROOT_MESSAGE_PARENT_ID;
		const siblings = index.idsByParentId.get(parentId) || [message.id];
		const currentIndex = index.positionByParentId.get(parentId)?.get(message.id) ?? 0;

		return {
			message,
			siblings,
			currentIndex
		};
	});
}
