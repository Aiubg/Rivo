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
import {
	ChatStateActions,
	type ChatStateActionContext,
	type ChatSubmitOptions,
	type ResumeActiveRunOptions
} from '$lib/hooks/chat-state/actions';
import { processChatStream } from '$lib/hooks/chat-state/process-stream';
import { clearStoredRunCursor } from '$lib/hooks/chat-state/run-stream';
import { getChatSearchResults } from '$lib/hooks/chat-state/search-results';
import { RunResumeScheduler } from '$lib/hooks/chat-state/run-resume-scheduler';
import { getFileUploadKey, uploadAttachmentFile } from '$lib/hooks/chat-state/upload';

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
	private runResumeScheduler = new RunResumeScheduler({
		onResume: (options) => {
			void this.resumeActiveRun(options);
		},
		onLimitReached: ({ runId, cursor, state }) => {
			logger.warn('[chat] resume limit reached', {
				runId,
				attempts: state.count,
				startedAt: state.startedAt,
				lastError: state.lastError,
				cursor
			});
			toast.error(get(t)(state.lastError));
		},
		onSchedule: ({ runId, cursor, errorKey, delayMs, state }) => {
			logger.warn('[chat] scheduling run resume', {
				runId,
				attempt: state.count,
				cursor,
				errorKey,
				delayMs
			});
		}
	});
	private actions: ChatStateActions;
	private messageTreeIndex = $derived.by(() => createMessageTreeIndex(this.allMessages));

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
		return getChatSearchResults(this.allMessages);
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
		const uploadKey = getFileUploadKey(file);
		this.uploadControllers.get(uploadKey)?.abort();
		const controller = new AbortController();
		this.uploadControllers.set(uploadKey, controller);
		try {
			const result = await uploadAttachmentFile(file, controller);
			if (result.ok) {
				return result.attachment;
			}

			if (!result.aborted) {
				toast.error(get(t)(result.errorKey));
			}
		} catch (error) {
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
		this.runResumeScheduler.reset();
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
		this.runResumeScheduler.clearRecoveryState(runId);
		clearStoredRunCursor(runId);
	}

	private clearPendingRunResumeTimer(runId?: string | null) {
		this.runResumeScheduler.clearPending(runId);
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
		return this.runResumeScheduler.schedule(options);
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
