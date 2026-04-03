import { replaceState } from '$app/navigation';
import { resolve } from '$app/paths';
import { getChatDraftStorageKey } from '$lib/components/multimodal/draft-storage';
import { connectRunStreamWithRetry } from '$lib/hooks/chat-state/connect-run-stream';
import { personalization } from '$lib/hooks/personalization.svelte';
import { randomId } from '$lib/utils/misc';
import { fetchWithTimeout } from '$lib/utils/network';
import { createMessageTreeIndex, extractTextFromMessage, getMessagePath } from '$lib/utils/chat';
import type { Attachment } from '$lib/types/attachment';
import type { Chat as ChatClient } from '$lib/types/chat-client';
import type { Chat as DbChat, User } from '$lib/types/db';
import type { MessagePart, UIMessageWithTree } from '$lib/types/message';
import type { ChatHistory } from '$lib/hooks/chat-history.svelte';
import { readStoredRunCursor, readStreamErrorMessage } from './run-stream';
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';
import { toast } from 'svelte-sonner';
import { SvelteDate } from 'svelte/reactivity';

export type ChatSubmitOptions = {
	experimental_attachments?: Attachment[];
	content?: string;
	preserveInput?: boolean;
	parentId?: string | null;
	regenerateMessageId?: string;
	commitUserImmediately?: boolean;
};

export type ResumeActiveRunOptions = {
	id: string;
	assistantMessageId: string;
	cursor: number;
};

export type ScheduleRunResumeOptions = {
	runId: string;
	assistantMessageId: string;
	cursor: number;
	errorKey: string;
	delayMs: number;
};

export function buildSelectedMessageIdsForMessage(
	allMessages: ReadonlyArray<UIMessageWithTree>,
	selectedMessageIds: Record<string, string>,
	messageId: string
): Record<string, string> | null {
	const { byId } = createMessageTreeIndex(allMessages);
	const message = byId.get(messageId);
	if (!message) return null;

	const path: string[] = [messageId];
	let currentParentId = message.parentId;
	while (currentParentId) {
		const parent = byId.get(currentParentId);
		if (!parent) break;
		path.unshift(currentParentId);
		currentParentId = parent.parentId;
	}

	const nextSelectedIds = { ...selectedMessageIds };
	let changed = false;
	let previousId = 'root';

	for (const id of path) {
		if (nextSelectedIds[previousId] !== id) {
			nextSelectedIds[previousId] = id;
			changed = true;
		}
		previousId = id;
	}

	return changed ? nextSelectedIds : null;
}

export function switchSelectedMessageBranch(
	selectedMessageIds: Record<string, string>,
	parentId: string,
	messageId: string
): Record<string, string> {
	return {
		...selectedMessageIds,
		[parentId || 'root']: messageId
	};
}

export type ChatStateActionContext = {
	state: {
		get user(): User | undefined;
		get chat(): DbChat | undefined;
		set chat(value: DbChat | undefined);
		get chatId(): string;
		get allMessages(): UIMessageWithTree[];
		set allMessages(value: UIMessageWithTree[]);
		get selectedMessageIds(): Record<string, string>;
		set selectedMessageIds(value: Record<string, string>);
		get visibleMessages(): UIMessageWithTree[];
		get status(): ChatClient['status'];
		set status(value: ChatClient['status']);
		get input(): string;
		set input(value: string);
		get attachments(): Attachment[];
		set attachments(value: Attachment[]);
		get abortController(): AbortController | null;
		set abortController(value: AbortController | null);
		get activeRunId(): string | null;
		set activeRunId(value: string | null);
	};
	services: {
		chatHistory: ChatHistory;
	};
	callbacks: {
		saveSelectedMessageIds(): void;
		finalizeStreaming(): Promise<void>;
		clearRunRecoveryState(runId: string | null | undefined): void;
		scheduleRunResume(options: ScheduleRunResumeOptions): boolean;
		processStream(
			body: ReadableStream<Uint8Array>,
			assistantMessageId: string,
			onFirstRecord?: () => void,
			onError?: (errorKey: string) => void
		): Promise<void>;
	};
};

export class ChatStateActions {
	constructor(private readonly context: ChatStateActionContext) {}

	private createUserMessage(text: string) {
		return {
			id: randomId(),
			role: 'user' as const,
			parts: [{ type: 'text' as const, text }],
			attachments: []
		};
	}

	private createAssistantMessage(id: string) {
		return {
			id,
			role: 'assistant' as const,
			parts: [],
			attachments: []
		};
	}

	private async streamAnonymousChat(options: {
		assistantMessageId: string;
		parentId: string | null;
		payloadMessages: Array<{
			id: string;
			role: string;
			content: string;
			parts: MessagePart[];
			attachments: Attachment[] | undefined;
		}>;
		outerAbortSignal: AbortSignal;
		commitSubmission: () => void;
	}) {
		const response = await fetchWithTimeout('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				id: this.context.state.chatId,
				messages: options.payloadMessages,
				parentId: options.parentId,
				assistantMessageId: options.assistantMessageId,
				personalization: personalization.value
			}),
			signal: options.outerAbortSignal,
			timeout: 15000
		});

		if (!response.ok) {
			throw new Error(await readStreamErrorMessage(response, 'common.request_failed'));
		}

		if (!response.body) {
			throw new Error('run.invalid_response');
		}

		await this.context.callbacks.processStream(
			response.body,
			options.assistantMessageId,
			options.commitSubmission
		);
	}

	async handleSubmit(event?: Event, options?: ChatSubmitOptions) {
		if (event) event.preventDefault();
		if (this.context.state.status === 'streaming' || this.context.state.status === 'submitted') {
			return;
		}

		const preserveInput = options?.preserveInput ?? false;
		const rawInput = options?.content ?? this.context.state.input ?? '';
		const content = rawInput.trim();
		const currentAttachments = options?.experimental_attachments ?? this.context.state.attachments;
		if (content.length === 0 && !options?.regenerateMessageId && currentAttachments.length === 0) {
			return;
		}

		const lastMessage =
			this.context.state.visibleMessages[this.context.state.visibleMessages.length - 1];

		let userMessage: UIMessageWithTree;
		if (options?.regenerateMessageId) {
			const target = this.context.state.allMessages.find(
				(message) => message.id === options.regenerateMessageId
			);
			if (!target) throw new Error('chat.message_not_found');
			if (target.role === 'assistant') {
				if (!target.parentId) throw new Error('chat.message_not_found');
				const parent = this.context.state.allMessages.find(
					(message) => message.id === target.parentId
				);
				if (!parent || parent.role !== 'user') throw new Error('chat.message_not_found');
				userMessage = parent;
			} else {
				userMessage = target;
			}
		} else {
			userMessage = {
				...this.createUserMessage(content),
				parentId: options?.parentId !== undefined ? options.parentId : lastMessage?.id || null,
				attachments: currentAttachments.map((attachment) => ({
					url: attachment.url,
					name: attachment.name,
					contentType: attachment.contentType,
					content: attachment.content,
					size: attachment.size,
					hash: attachment.hash,
					lastModified: attachment.lastModified
				}))
			};
		}

		const assistantMessageId = randomId();
		const parentId = userMessage.parentId;
		const previousMessages = [...this.context.state.allMessages];
		const previousSelectedMessageIds = { ...this.context.state.selectedMessageIds };
		const hadExistingChat = !!this.context.state.chat;
		const shouldClearNewChatDraft = !hadExistingChat && !options?.regenerateMessageId;

		if (options?.regenerateMessageId) {
			this.context.state.selectedMessageIds = {
				...this.context.state.selectedMessageIds,
				[userMessage.id]: assistantMessageId
			};
		}

		const commitUserImmediately = !!options?.commitUserImmediately && !options?.regenerateMessageId;
		let userCommittedEarly = false;

		if (commitUserImmediately) {
			this.context.state.allMessages = [...this.context.state.allMessages, userMessage];
			this.context.state.selectedMessageIds = {
				...this.context.state.selectedMessageIds,
				[userMessage.parentId || 'root']: userMessage.id
			};
			userCommittedEarly = true;

			if (!preserveInput && options?.content === undefined) {
				this.context.state.input = '';
				this.context.state.attachments = [];
			}
		}

		let runId: string | null = null;
		let initialStreamCursor = 0;
		let committed = false;

		const commitSubmission = () => {
			if (committed) return;
			const assistantMessage = {
				...this.createAssistantMessage(assistantMessageId),
				parentId: userMessage.id
			};

			if (!options?.regenerateMessageId) {
				if (userCommittedEarly) {
					this.context.state.allMessages = [...this.context.state.allMessages, assistantMessage];
					this.context.state.selectedMessageIds = {
						...this.context.state.selectedMessageIds,
						[userMessage.id]: assistantMessageId
					};
				} else {
					this.context.state.allMessages = [
						...this.context.state.allMessages,
						userMessage,
						assistantMessage
					];
					this.context.state.selectedMessageIds = {
						...this.context.state.selectedMessageIds,
						[userMessage.parentId || 'root']: userMessage.id,
						[userMessage.id]: assistantMessageId
					};
				}
			} else {
				this.context.state.allMessages = [...this.context.state.allMessages, assistantMessage];
				this.context.state.selectedMessageIds = {
					...this.context.state.selectedMessageIds,
					[userMessage.id]: assistantMessageId
				};
			}
			committed = true;

			if (!preserveInput && options?.content === undefined) {
				this.context.state.input = '';
				this.context.state.attachments = [];
			}
			if (typeof window !== 'undefined' && shouldClearNewChatDraft) {
				localStorage.removeItem(getChatDraftStorageKey());
			}

			if (this.context.state.user) {
				this.context.services.chatHistory.setGenerating(this.context.state.chatId, true);
				const existingChat = this.context.services.chatHistory.getChatDetails(
					this.context.state.chatId
				);
				if (!existingChat) {
					const now = new SvelteDate();
					this.context.state.chat = {
						id: this.context.state.chatId,
						pinned: false,
						unread: false,
						createdAt: now,
						updatedAt: now,
						title: get(t)('common.new_chat'),
						userId: this.context.state.user.id,
						visibility: 'private'
					};
					this.context.services.chatHistory.upsertChat(this.context.state.chat);
					this.context.services.chatHistory.triggerScrollToTop();
				} else {
					this.context.state.chat = {
						...existingChat,
						updatedAt: new SvelteDate()
					};
					this.context.services.chatHistory.upsertChat(this.context.state.chat);
					this.context.services.chatHistory.triggerScrollToTop();
				}
				this.context.services.chatHistory.setActiveChatId(this.context.state.chatId);
				this.context.callbacks.saveSelectedMessageIds();
				replaceState(resolve(`/chat/${this.context.state.chatId}`), {});
			}

			this.context.state.status = 'streaming';
		};

		try {
			const currentVisibleMessages = getMessagePath(
				this.context.state.allMessages,
				this.context.state.selectedMessageIds
			);
			const parentIndex =
				parentId === null
					? -1
					: currentVisibleMessages.findIndex((message) => message.id === parentId);
			const baseMessages =
				parentId === null
					? []
					: parentIndex !== -1
						? currentVisibleMessages.slice(0, parentIndex + 1)
						: currentVisibleMessages;
			const nextMessages = [...baseMessages, userMessage];
			const payloadMessages = nextMessages.map((message) => ({
				id: message.id,
				role: message.role,
				content: extractTextFromMessage(message),
				parts: Array.isArray(message.parts) ? message.parts : [],
				attachments: message.attachments
			}));

			this.context.state.status = 'submitted';
			this.context.state.abortController = new AbortController();
			const outerAbortSignal = this.context.state.abortController.signal;

			if (!this.context.state.user) {
				await this.streamAnonymousChat({
					assistantMessageId,
					parentId: userMessage.parentId ?? null,
					payloadMessages,
					outerAbortSignal,
					commitSubmission
				});
			} else {
				const startResponse = await fetchWithTimeout('/api/runs', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id: this.context.state.chatId,
						messages: payloadMessages,
						parentId: userMessage.parentId,
						assistantMessageId,
						personalization: personalization.value
					}),
					signal: outerAbortSignal,
					timeout: 15000
				});

				if (!startResponse.ok) {
					throw new Error(await readStreamErrorMessage(startResponse, 'common.request_failed'));
				}

				const startJson = (await startResponse.json().catch(() => null)) as {
					runId?: unknown;
				} | null;
				runId = startJson && typeof startJson.runId === 'string' ? startJson.runId : null;
				if (!runId) {
					throw new Error('run.invalid_response');
				}

				const confirmedRunId = runId;
				this.context.state.activeRunId = confirmedRunId;
				commitSubmission();

				const initialCursor = readStoredRunCursor(confirmedRunId, 0);
				initialStreamCursor = initialCursor;
				let streamErrorKey: string | null = null;

				await connectRunStreamWithRetry({
					initialCursor,
					outerAbortSignal,
					fetchStream: (cursor, signal) =>
						fetch(`/api/runs/${confirmedRunId}/stream?cursor=${cursor}`, { signal }),
					processStream: async (body) => {
						streamErrorKey = null;
						await this.context.callbacks.processStream(
							body,
							assistantMessageId,
							commitSubmission,
							(errorKey) => {
								streamErrorKey = errorKey;
							}
						);
						if (streamErrorKey) {
							throw new Error(streamErrorKey);
						}
					},
					readCursor: (fallback) => readStoredRunCursor(confirmedRunId, fallback),
					shouldRetry: (error) => error instanceof Error && error.message === 'run.stream_failed'
				});
			}
		} catch (error: unknown) {
			const externalAborted =
				error instanceof DOMException &&
				error.name === 'AbortError' &&
				(!this.context.state.abortController || this.context.state.abortController.signal.aborted);

			if (externalAborted) {
				await this.context.callbacks.finalizeStreaming();
			} else {
				if (!runId || !committed) {
					this.context.state.allMessages = previousMessages;
					this.context.state.selectedMessageIds = previousSelectedMessageIds;

					if (userCommittedEarly && !preserveInput && options?.content === undefined) {
						this.context.state.input = content;
						this.context.state.attachments = currentAttachments;
					}
				}

				let errorKey = 'common.unknown_error';
				if (error instanceof Error && typeof error.message === 'string' && error.message) {
					errorKey = error.message;
				}
				if (
					error instanceof DOMException &&
					error.name === 'AbortError' &&
					!this.context.state.abortController?.signal.aborted
				) {
					errorKey = 'run.stream_failed';
				}
				if (
					errorKey === 'Failed to fetch' ||
					errorKey.includes('NetworkError') ||
					errorKey.includes('Load failed') ||
					errorKey.includes('fetch')
				) {
					errorKey = runId ? 'run.stream_failed' : 'common.request_failed';
				}

				const willAttemptResume = !!runId && committed && errorKey === 'run.stream_failed';
				if (!willAttemptResume || !committed) {
					this.context.callbacks.clearRunRecoveryState(runId);
					toast.error(get(t)(errorKey));
				}

				if (!committed && !hadExistingChat) {
					this.context.services.chatHistory.setGenerating(this.context.state.chatId, false);
					await this.context.services.chatHistory.deleteChat(this.context.state.chatId);
					this.context.state.chat = undefined;
				}

				if (runId && willAttemptResume) {
					const resumeCursor = readStoredRunCursor(runId, initialStreamCursor);
					this.context.callbacks.scheduleRunResume({
						runId,
						assistantMessageId,
						cursor: resumeCursor,
						errorKey,
						delayMs: 750
					});
				}
			}
			this.context.state.status = 'ready';
		} finally {
			this.context.state.abortController = null;
			this.context.state.activeRunId = null;
		}
	}

	async resumeActiveRun(options: ResumeActiveRunOptions) {
		if (this.context.state.status === 'streaming' || this.context.state.status === 'submitted') {
			return;
		}

		this.context.state.activeRunId = options.id;
		this.context.state.status = 'streaming';
		this.context.state.abortController = new AbortController();
		const outerAbortSignal = this.context.state.abortController.signal;
		const streamCursor = options.cursor;

		try {
			await connectRunStreamWithRetry({
				initialCursor: streamCursor,
				outerAbortSignal,
				fetchStream: (cursor, signal) =>
					fetch(`/api/runs/${options.id}/stream?cursor=${cursor}`, { signal }),
				processStream: (body) =>
					this.context.callbacks.processStream(body, options.assistantMessageId),
				readCursor: (fallback) => readStoredRunCursor(options.id, fallback),
				shouldRetry: () => true
			});
		} catch (error) {
			const externalAborted =
				error instanceof DOMException &&
				error.name === 'AbortError' &&
				(!this.context.state.abortController || this.context.state.abortController.signal.aborted);

			if (externalAborted) {
				await this.context.callbacks.finalizeStreaming();
			} else {
				const errorKey =
					error instanceof Error && error.message ? error.message : 'run.stream_failed';
				this.context.callbacks.scheduleRunResume({
					runId: options.id,
					assistantMessageId: options.assistantMessageId,
					cursor: readStoredRunCursor(options.id, streamCursor),
					errorKey,
					delayMs: 1500
				});
			}
			this.context.state.status = 'ready';
		} finally {
			this.context.state.abortController = null;
			this.context.state.activeRunId = null;
		}
	}

	async selectMessageById(messageId: string): Promise<void> {
		const nextSelectedIds = buildSelectedMessageIdsForMessage(
			this.context.state.allMessages,
			this.context.state.selectedMessageIds,
			messageId
		);
		if (!nextSelectedIds) return;

		this.context.state.selectedMessageIds = nextSelectedIds;
		this.context.callbacks.saveSelectedMessageIds();
	}

	async handleRegenerate(params: { messageId: string }): Promise<void> {
		await this.handleSubmit(undefined, {
			regenerateMessageId: params.messageId
		});
	}

	async handleEdit(params: { messageId: string; newContent: string }): Promise<void> {
		const messageIndex = this.context.state.allMessages.findIndex(
			(message) => message.id === params.messageId
		);
		if (messageIndex === -1) return;

		const originalMessage = this.context.state.allMessages[messageIndex];
		if (!originalMessage) return;

		const editedMessage: UIMessageWithTree = {
			...originalMessage,
			id: randomId(),
			role: originalMessage.role || 'user',
			parts: [{ type: 'text', text: params.newContent }]
		};

		this.context.state.allMessages = [...this.context.state.allMessages, editedMessage];
		await this.selectMessageById(editedMessage.id);
		await this.handleSubmit(undefined, {
			regenerateMessageId: editedMessage.id
		});
	}

	async handleSwitchBranch(parentId: string, messageId: string): Promise<void> {
		this.context.state.selectedMessageIds = switchSelectedMessageBranch(
			this.context.state.selectedMessageIds,
			parentId,
			messageId
		);
		this.context.callbacks.saveSelectedMessageIds();
	}
}
