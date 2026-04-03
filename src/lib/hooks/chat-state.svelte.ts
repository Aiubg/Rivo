import type { Chat as ChatClient } from '$lib/types/chat-client';
import type { MessagePart, UIMessageWithTree } from '$lib/types/message';
import type { Attachment } from '$lib/types/attachment';
import { ChatHistory } from '$lib/hooks/chat-history.svelte';
import type { Chat as DbChat, User } from '$lib/types/db';
import { get } from 'svelte/store';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import {
	computeDefaultSelectedMessageIds,
	computeMessagesWithSiblingsFromIndex,
	createMessageTreeIndex,
	getMessagePathFromIndex
} from '$lib/utils/chat';
import { randomId } from '$lib/utils/misc';
import { fetchWithTimeout } from '$lib/utils/network';
import { logger } from '$lib/utils/logger';
import { t } from 'svelte-i18n';
import { toast } from 'svelte-sonner';
import type { SearchResult } from '$lib/hooks/search-sidebar.svelte';
import {
	ChatStateActions,
	type ChatStateActionContext,
	type ChatSubmitOptions,
	type ResumeActiveRunOptions
} from '$lib/hooks/chat-state/actions';
import { processChatStream } from '$lib/hooks/chat-state/process-stream';
import {
	canResumeRun,
	clearStoredRunCursor,
	getNextRunResumeState,
	type RunResumeState
} from '$lib/hooks/chat-state/run-stream';

type UploadResponse = {
	url?: unknown;
	pathname?: unknown;
	contentType?: unknown;
	content?: unknown;
	size?: unknown;
	message?: unknown;
	hash?: unknown;
	lastModified?: unknown;
};

/**
 * ChatState class manages the state and logic for a single chat conversation.
 * It handles message submission, file uploads, streaming responses, and branching logic.
 */
export class ChatState {
	/** Current authenticated user */
	user: User | undefined;
	/** Current chat database record */
	chat = $state<DbChat | undefined>(undefined);

	/** All messages in the conversation tree */
	allMessages = $state<UIMessageWithTree[]>([]);
	/** Mapping of parent message ID to selected child message ID for branching */
	selectedMessageIds = $state<Record<string, string>>({});
	/** Current status of the chat (ready, submitted, streaming, error) */
	status = $state<ChatClient['status']>('ready');
	/** Current text input value */
	input = $state('');
	/** List of uploaded attachments */
	attachments = $state<Attachment[]>([]);
	/** Queue of filenames currently being uploaded */
	uploadQueue = new SvelteSet<string>();

	private abortController: AbortController | null = null;
	private chatHistory = ChatHistory.fromContext();
	private _generatedChatId: string | null = null;
	private activeRunId: string | null = null;
	private uploadControllers = new SvelteMap<string, AbortController>();
	private runResumeStates = new SvelteMap<string, RunResumeState>();
	private runResumeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	private actions: ChatStateActions;
	private messageTreeIndex = $derived.by(() => createMessageTreeIndex(this.allMessages));

	private fileRequestKey(file: File): string {
		return `${file.name}:${file.size}:${file.lastModified}`;
	}

	constructor(
		user: User | undefined,
		chat: DbChat | undefined,
		initialMessages: UIMessageWithTree[],
		options?: { chatId?: string }
	) {
		this.user = user;
		this.chat = chat;
		this.allMessages = initialMessages;
		this._generatedChatId = options?.chatId ?? null;

		const defaultIds = computeDefaultSelectedMessageIds(initialMessages);
		if (typeof window !== 'undefined' && chat?.id) {
			const saved = localStorage.getItem(`chat_path_${chat.id}`);
			if (saved) {
				try {
					this.selectedMessageIds = { ...defaultIds, ...JSON.parse(saved) };
				} catch (_e) {
					this.selectedMessageIds = defaultIds;
				}
			} else {
				this.selectedMessageIds = defaultIds;
			}
		} else {
			this.selectedMessageIds = defaultIds;
		}

		this.actions = new ChatStateActions(this.createActionContext());
	}

	private saveSelectedMessageIds() {
		if (typeof window !== 'undefined') {
			localStorage.setItem(`chat_path_${this.chatId}`, JSON.stringify(this.selectedMessageIds));
		}
	}

	private createActionContext(): ChatStateActionContext {
		const readChatState = () => this;

		return {
			state: {
				get user() {
					return readChatState().user;
				},
				get chat() {
					return readChatState().chat;
				},
				set chat(value) {
					readChatState().chat = value;
				},
				get chatId() {
					return readChatState().chatId;
				},
				get allMessages() {
					return readChatState().allMessages;
				},
				set allMessages(value) {
					readChatState().allMessages = value;
				},
				get selectedMessageIds() {
					return readChatState().selectedMessageIds;
				},
				set selectedMessageIds(value) {
					readChatState().selectedMessageIds = value;
				},
				get visibleMessages() {
					return readChatState().visibleMessages;
				},
				get status() {
					return readChatState().status;
				},
				set status(value) {
					readChatState().status = value;
				},
				get input() {
					return readChatState().input;
				},
				set input(value) {
					readChatState().input = value;
				},
				get attachments() {
					return readChatState().attachments;
				},
				set attachments(value) {
					readChatState().attachments = value;
				},
				get abortController() {
					return readChatState().abortController;
				},
				set abortController(value) {
					readChatState().abortController = value;
				},
				get activeRunId() {
					return readChatState().activeRunId;
				},
				set activeRunId(value) {
					readChatState().activeRunId = value;
				}
			},
			services: {
				chatHistory: readChatState().chatHistory
			},
			callbacks: {
				saveSelectedMessageIds: () => readChatState().saveSelectedMessageIds(),
				finalizeStreaming: () => readChatState().finalizeStreaming(),
				clearRunRecoveryState: (runId) => readChatState().clearRunRecoveryState(runId),
				scheduleRunResume: (options) => readChatState().scheduleRunResume(options),
				processStream: (body, assistantMessageId, onFirstRecord, onError) =>
					readChatState().processStream(body, assistantMessageId, onFirstRecord, onError)
			}
		};
	}

	/**
	 * Returns the linear path of messages currently visible based on branching selection.
	 */
	get visibleMessages() {
		return getMessagePathFromIndex(this.messageTreeIndex, this.selectedMessageIds);
	}

	/**
	 * Returns messages along with their siblings for branch switching UI.
	 */
	get messagesWithSiblings() {
		return computeMessagesWithSiblingsFromIndex(this.messageTreeIndex, this.visibleMessages);
	}

	/**
	 * Extracts all unique search results from the entire message tree.
	 */
	get searchResults() {
		const results: SearchResult[] = [];
		const seenUrls = new SvelteSet<string>();

		for (const message of this.allMessages) {
			for (const part of message.parts ?? []) {
				const resultObj = part.toolInvocation?.result ?? part.output;
				if (
					(part.toolInvocation?.toolName === 'tavily_search' ||
						part.toolName === 'tavily_search') &&
					resultObj &&
					typeof resultObj === 'object' &&
					'results' in resultObj &&
					Array.isArray((resultObj as { results?: unknown[] }).results)
				) {
					for (const r of (resultObj as { results: SearchResult[] }).results) {
						if (r?.url && !seenUrls.has(r.url)) {
							results.push(r);
							seenUrls.add(r.url);
						}
					}
				}
			}
		}
		return results;
	}

	/**
	 * Returns the current chat ID, generating a random one if it's a new chat.
	 */
	get chatId() {
		if (this.chat) return this.chat.id;
		if (!this._generatedChatId) {
			this._generatedChatId = randomId();
		}
		return this._generatedChatId;
	}

	/**
	 * Uploads a file to the server.
	 * @param file The file to upload.
	 * @returns The uploaded attachment details or undefined on failure.
	 */
	async uploadFile(file: File): Promise<Attachment | undefined> {
		const uploadKey = this.fileRequestKey(file);
		this.uploadControllers.get(uploadKey)?.abort();
		const controller = new AbortController();
		this.uploadControllers.set(uploadKey, controller);

		const formData = new FormData();
		formData.append('file', file);
		try {
			const response = await fetchWithTimeout('/api/files/upload', {
				method: 'POST',
				body: formData,
				timeout: 30000,
				retries: 1,
				signal: controller.signal
			});
			if (response.ok) {
				const data: UploadResponse = await response.json();
				if (
					data &&
					typeof data.url === 'string' &&
					typeof data.pathname === 'string' &&
					typeof data.contentType === 'string'
				) {
					return {
						url: data.url,
						name: data.pathname,
						contentType: data.contentType,
						content: typeof data.content === 'string' ? data.content : undefined,
						size: typeof data.size === 'number' ? data.size : undefined,
						hash: typeof data.hash === 'string' ? data.hash : undefined,
						lastModified: typeof data.lastModified === 'number' ? data.lastModified : undefined
					};
				}
				toast.error(get(t)('upload.invalid_response'));
				return;
			}
			let errorKey = 'upload.failed';
			const rawText = await response.text().catch(() => '');
			if (rawText) {
				try {
					const parsed = JSON.parse(rawText) as { message?: unknown };
					if (parsed && typeof parsed.message === 'string') {
						errorKey = parsed.message;
					} else {
						errorKey = rawText;
					}
				} catch {
					errorKey = rawText;
				}
			}
			toast.error(get(t)(errorKey));
		} catch (error) {
			if ((error as Error).name === 'AbortError') return;
			logger.error('Error uploading file:', error);
			toast.error(get(t)('upload.retry_failed'));
		} finally {
			if (this.uploadControllers.get(uploadKey) === controller) {
				this.uploadControllers.delete(uploadKey);
			}
		}
	}

	/**
	 * Handles a list of files to be uploaded.
	 */
	async handleFileChange(files: File[]) {
		const fileNames = files.map((file) => file.name);
		fileNames.forEach((name) => this.uploadQueue.add(name));
		try {
			const uploaded = await Promise.all(files.map((f) => this.uploadFile(f)));
			const okAttachments = uploaded.filter((a): a is Attachment => a !== undefined);
			if (okAttachments.length > 0) {
				this.attachments = [...this.attachments, ...okAttachments];
			}
		} catch (error) {
			logger.error('File upload process failed', error);
		} finally {
			fileNames.forEach((name) => this.uploadQueue.delete(name));
		}
	}

	/**
	 * Removes an attachment from the current draft only.
	 * This is a local "unlink" action and must not delete the file from the library.
	 */
	async removeAttachment(url: string) {
		this.attachments = this.attachments.filter((a) => a.url !== url);
	}

	/**
	 * Adds or updates attachments on the current draft message.
	 * Existing attachments are deduplicated by URL and merged with incoming fields.
	 */
	addAttachments(nextAttachments: Attachment[]) {
		if (nextAttachments.length === 0) return;

		const merged = [...this.attachments];
		const indexByUrl = new SvelteMap<string, number>();
		for (let i = 0; i < merged.length; i++) {
			const url = merged[i]?.url;
			if (url) indexByUrl.set(url, i);
		}

		for (const incoming of nextAttachments) {
			if (!incoming?.url) continue;
			const existingIndex = indexByUrl.get(incoming.url);
			if (existingIndex === undefined) {
				indexByUrl.set(incoming.url, merged.length);
				merged.push(incoming);
				continue;
			}

			merged[existingIndex] = {
				...merged[existingIndex],
				...incoming
			};
		}

		this.attachments = merged;
	}

	/**
	 * Aborts the current streaming request.
	 */
	async stop() {
		const runId = this.activeRunId;
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		if (runId) {
			try {
				await fetchWithTimeout(`/api/runs/${runId}/cancel`, {
					method: 'POST',
					timeout: 15000,
					retries: 0
				});
			} catch (_e) {
				// ignore
			}
		}
		this.clearRunRecoveryState(runId);
		this.activeRunId = null;
		this.status = 'ready';
	}

	disconnectStream() {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		this.clearPendingRunResumeTimer();
		this.runResumeStates.clear();
	}

	/**
	 * Finalizes the streaming state and refreshes chat history.
	 */
	async finalizeStreaming() {
		if (this.status !== 'ready') {
			this.status = 'ready';
			if (this.user) {
				this.chatHistory.clearUnread(this.chatId, { force: true });
				await this.chatHistory.refetch();
			}
		}
	}

	private clearRunRecoveryState(runId: string | null | undefined) {
		if (!runId) return;
		this.clearPendingRunResumeTimer(runId);
		this.runResumeStates.delete(runId);
		clearStoredRunCursor(runId);
	}

	private clearPendingRunResumeTimer(runId?: string | null) {
		if (runId) {
			const timeoutId = this.runResumeTimeouts.get(runId);
			if (timeoutId) {
				clearTimeout(timeoutId);
				this.runResumeTimeouts.delete(runId);
			}
			return;
		}

		for (const timeoutId of this.runResumeTimeouts.values()) {
			clearTimeout(timeoutId);
		}
		this.runResumeTimeouts.clear();
	}

	private updateAssistantMessageParts(assistantMessageId: string, parts: MessagePart[]) {
		const assistantIndex = this.allMessages.findIndex(
			(message) => message.id === assistantMessageId
		);
		if (assistantIndex === -1) {
			return;
		}

		const currentMessage = this.allMessages[assistantIndex];
		if (!currentMessage) {
			return;
		}

		this.allMessages[assistantIndex] = {
			...currentMessage,
			parts: [...parts] as UIMessageWithTree['parts']
		};
	}

	private scheduleRunResume(options: {
		runId: string;
		assistantMessageId: string;
		cursor: number;
		errorKey: string;
		delayMs: number;
	}) {
		const nextState = getNextRunResumeState(
			this.runResumeStates.get(options.runId),
			options.errorKey
		);

		if (!canResumeRun(nextState)) {
			this.clearPendingRunResumeTimer(options.runId);
			this.runResumeStates.delete(options.runId);
			logger.warn('[chat] resume limit reached', {
				runId: options.runId,
				attempts: nextState.count,
				startedAt: nextState.startedAt,
				lastError: nextState.lastError,
				cursor: options.cursor
			});
			toast.error(get(t)(nextState.lastError));
			return false;
		}

		this.runResumeStates.set(options.runId, nextState);
		logger.warn('[chat] scheduling run resume', {
			runId: options.runId,
			attempt: nextState.count,
			cursor: options.cursor,
			errorKey: options.errorKey,
			delayMs: options.delayMs
		});

		this.clearPendingRunResumeTimer(options.runId);
		const timeoutId = setTimeout(() => {
			this.runResumeTimeouts.delete(options.runId);
			void this.resumeActiveRun({
				id: options.runId,
				assistantMessageId: options.assistantMessageId,
				cursor: options.cursor
			});
		}, options.delayMs);
		this.runResumeTimeouts.set(options.runId, timeoutId);

		return true;
	}

	/**
	 * Handles message submission.
	 * @param event Optional event object to prevent default behavior.
	 * @param options Submission options (content, attachments, etc.)
	 */
	async handleSubmit(event?: Event, options?: ChatSubmitOptions) {
		await this.actions.handleSubmit(event, options);
	}

	/**
	 * Processes the incoming stream from the AI API.
	 * @param body Readable stream of bytes.
	 * @param assistantMessageId ID of the assistant message to update.
	 */
	private async processStream(
		body: ReadableStream<Uint8Array>,
		assistantMessageId: string,
		onFirstRecord?: () => void,
		onError?: (errorKey: string) => void
	) {
		await processChatStream({
			body,
			assistantMessageId,
			abortSignal: this.abortController?.signal,
			activeRunId: this.activeRunId,
			getMessages: () => this.allMessages,
			updateAssistantParts: (messageId, parts) =>
				this.updateAssistantMessageParts(messageId, parts),
			onFirstRecord,
			onError,
			onFinish: () => this.finalizeStreaming(),
			clearRunRecoveryState: (runId) => this.clearRunRecoveryState(runId)
		});
	}

	/**
	 * Resumes an active run that was interrupted.
	 */
	async resumeActiveRun(options: ResumeActiveRunOptions) {
		this.clearPendingRunResumeTimer(options.id);
		await this.actions.resumeActiveRun(options);
	}

	/**
	 * Selects a message by ID and updates the conversation path.
	 */
	async selectMessageById(messageId: string): Promise<void> {
		await this.actions.selectMessageById(messageId);
	}

	/**
	 * Regenerates a message.
	 */
	async handleRegenerate(params: { messageId: string }): Promise<void> {
		await this.actions.handleRegenerate(params);
	}

	/**
	 * Edits a message and regenerates the conversation from that point.
	 */
	async handleEdit(params: { messageId: string; newContent: string }): Promise<void> {
		await this.actions.handleEdit(params);
	}

	/**
	 * Switches to a different message branch.
	 */
	async handleSwitchBranch(parentId: string, messageId: string): Promise<void> {
		await this.actions.handleSwitchBranch(parentId, messageId);
	}

	/**
	 * Returns a client-compatible chat interface object.
	 */
	get chatClient(): ChatClient {
		return {
			id: this.chatId,
			messages: this.visibleMessages,
			status: this.status,
			input: this.input,
			append: async (payload) => {
				const experimental_attachments = (payload as { experimental_attachments?: Attachment[] })
					.experimental_attachments;
				await this.handleSubmit(undefined, {
					content: payload.content,
					experimental_attachments
				});
			},
			reload: async () => {
				const lastUserMessage = [...this.visibleMessages].reverse().find((m) => m.role === 'user');
				if (lastUserMessage) {
					await this.handleSubmit(undefined, {
						regenerateMessageId: lastUserMessage.id
					});
				}
			},
			handleSubmit: (event, options) => this.handleSubmit(event, options),
			stop: () => {
				void this.stop();
			}
		};
	}
}
