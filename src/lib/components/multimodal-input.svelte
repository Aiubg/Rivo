<script lang="ts">
	import { cn } from '$lib/utils/shadcn';
	import { onMount } from 'svelte';
	import { LocalStorage } from '$lib/hooks/local-storage.svelte';
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { toast } from 'svelte-sonner';
	import { useSidebar } from '$lib/components/ui/sidebar';
	import * as InputGroup from '$lib/components/ui/input-group';
	import AttachmentList from '$lib/components/multimodal/attachment-list.svelte';
	import AttachmentUploader from '$lib/components/multimodal/attachment-uploader.svelte';
	import { getChatDraftStorageKey } from '$lib/components/multimodal/draft-storage';
	import SubmitControls from '$lib/components/multimodal/submit-controls.svelte';
	import TextareaAutosize from '$lib/components/multimodal/textarea-autosize.svelte';
	import { modelSupportsVision } from '$lib/ai/model-registry';
	import { SelectedModel } from '$lib/hooks/selected-model.svelte';
	import type { ChatState } from '$lib/hooks/chat-state.svelte';
	import type { Attachment } from '$lib/types/attachment';

	let {
		chatState,
		class: c
	}: {
		chatState: ChatState;
		class?: string;
	} = $props();

	const sidebar = useSidebar();
	let mounted = $state(false);
	let textareaRef = $state(null) as HTMLTextAreaElement | null;
	let inputLayoutRef = $state(null) as HTMLDivElement | null;
	let inlineMeasureRef = $state(null) as HTMLTextAreaElement | null;
	let textareaExpanded = $state(false);
	let transitionsReady = $state(false);
	const newChatDraftStorageKey = getChatDraftStorageKey();
	const draftStorageKey = $derived(getChatDraftStorageKey(chatState.chat?.id));
	let storedInput = $state<LocalStorage<string> | null>(null);
	let storedInputKey = $state('');
	let layoutMeasureRaf = $state<number | null>(null);
	let transitionsReadyRaf = $state<number | null>(null);
	const loading = $derived(chatState.status === 'streaming' || chatState.status === 'submitted');
	const hasText = $derived(chatState.input.trim().length > 0);
	const hasAttachments = $derived(chatState.attachments.length > 0);
	const hasImageAttachments = $derived(
		chatState.attachments.some((attachment) => attachment.contentType?.startsWith('image/'))
	);
	const selectedChatModel = SelectedModel.fromContext();
	const supportsVisionInput = $derived(modelSupportsVision(selectedChatModel.value));
	const hasUnsupportedImageAttachments = $derived(hasImageAttachments && !supportsVisionInput);
	const uploadsInProgress = $derived(chatState.uploadQueue.size > 0);
	const canSend = $derived(
		(hasText || hasAttachments) && !uploadsInProgress && !hasUnsupportedImageAttachments
	);
	const inputHintId = 'chat-input-hint';
	const inputStatusId = 'chat-input-status';
	const inputDescribedBy = $derived.by(() => {
		const ids = [inputHintId];
		if (uploadsInProgress || hasUnsupportedImageAttachments) {
			ids.push(inputStatusId);
		}
		return ids.join(' ');
	});
	const submitStatus = $derived(
		chatState.status === 'submitted'
			? 'submitting'
			: chatState.status === 'streaming'
				? 'streaming'
				: 'idle'
	);

	const showWelcome = $derived(mounted && chatState.visibleMessages.length === 0);
	const chatInputMinLines = 1;

	function resolveLineHeight(style: CSSStyleDeclaration) {
		const lineHeight = Number.parseFloat(style.lineHeight);
		if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;
		const fontSize = Number.parseFloat(style.fontSize);
		if (Number.isFinite(fontSize) && fontSize > 0) return fontSize * 1.2;
		return 19.2;
	}

	function resolveSingleLineHeight(style: CSSStyleDeclaration) {
		const lineHeight = resolveLineHeight(style);
		const paddingTop = Number.parseFloat(style.paddingTop) || 0;
		const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
		const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
		const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;

		let height = lineHeight + paddingTop + paddingBottom;
		if (style.boxSizing === 'border-box') {
			height += borderTop + borderBottom;
		}
		return Math.ceil(height);
	}

	function armTransitions() {
		if (transitionsReady || transitionsReadyRaf !== null || !mounted) {
			return;
		}
		if (typeof requestAnimationFrame !== 'function') {
			transitionsReady = true;
			return;
		}
		transitionsReadyRaf = requestAnimationFrame(() => {
			transitionsReadyRaf = requestAnimationFrame(() => {
				transitionsReady = true;
				transitionsReadyRaf = null;
			});
		});
	}

	function measureInlineLayout() {
		if (!(inlineMeasureRef instanceof HTMLTextAreaElement)) return;

		inlineMeasureRef.style.height = 'auto';
		const style = getComputedStyle(inlineMeasureRef);
		const singleLineHeight = resolveSingleLineHeight(style);
		textareaExpanded = inlineMeasureRef.scrollHeight > singleLineHeight + 1;
		armTransitions();
	}

	function scheduleInlineLayoutMeasurement() {
		if (typeof requestAnimationFrame !== 'function') {
			measureInlineLayout();
			return;
		}
		if (layoutMeasureRaf !== null) return;
		layoutMeasureRaf = requestAnimationFrame(() => {
			layoutMeasureRaf = null;
			measureInlineLayout();
		});
	}

	function setInput(value: string) {
		chatState.input = value;
	}

	async function submitForm(event?: Event) {
		try {
			await chatState.handleSubmit(event, {
				commitUserImmediately: chatState.visibleMessages.length > 0
			});

			if (!sidebar.isMobile) {
				textareaRef?.focus();
			}
		} catch (_e) {
			// Error is already handled by toast in state.handleSubmit
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			if (loading) {
				return;
			}
			if (canSend) {
				submitForm();
			} else if (hasUnsupportedImageAttachments) {
				toast.error(get(t)('models.vision_not_supported'));
			}
		}
	}

	function handleFocus() {
		textareaRef?.focus();
	}

	function handleFileChange(files: File[]) {
		chatState.handleFileChange(files);
	}

	function handleSelectAttachments(attachments: Attachment[]) {
		chatState.addAttachments(attachments);
	}

	function handlePaste(event: ClipboardEvent) {
		const items = event.clipboardData?.items;
		if (!items) return;

		const files: File[] = [];
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (item?.kind === 'file') {
				const file = item.getAsFile();
				if (file) {
					files.push(file);
				}
			}
		}

		if (files.length > 0) {
			event.preventDefault();
			const imageFiles = files.filter(
				(file) =>
					file.type.toLowerCase().startsWith('image/') ||
					/\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name)
			);
			const blockedByVision = !supportsVisionInput && imageFiles.length > 0;
			if (blockedByVision) {
				toast.error(get(t)('models.vision_not_supported'));
			}
			const acceptedFiles = blockedByVision
				? files.filter(
						(file) =>
							!(
								file.type.toLowerCase().startsWith('image/') ||
								/\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name)
							)
					)
				: files;
			if (acceptedFiles.length > 0) {
				chatState.handleFileChange(acceptedFiles);
			}
		}
	}

	function handleSend() {
		if (hasUnsupportedImageAttachments) {
			toast.error(get(t)('models.vision_not_supported'));
			return;
		}
		void submitForm();
	}

	function handleStop() {
		chatState.stop();
	}

	$effect(() => {
		const nextKey = draftStorageKey;
		if (storedInput && storedInputKey === nextKey) {
			return;
		}

		if (
			storedInput &&
			storedInputKey === newChatDraftStorageKey &&
			nextKey !== newChatDraftStorageKey
		) {
			storedInput.delete();
		}

		storedInput?.destroy();
		storedInput = new LocalStorage(nextKey, '');
		storedInputKey = nextKey;

		if (mounted) {
			chatState.input = storedInput.value;
		}
	});

	onMount(() => {
		mounted = true;
		chatState.input = storedInput?.value ?? '';
		scheduleInlineLayoutMeasurement();
		return () => {
			if (layoutMeasureRaf !== null && typeof cancelAnimationFrame === 'function') {
				cancelAnimationFrame(layoutMeasureRaf);
			}
			if (transitionsReadyRaf !== null && typeof cancelAnimationFrame === 'function') {
				cancelAnimationFrame(transitionsReadyRaf);
			}
			storedInput?.destroy();
			storedInput = null;
			storedInputKey = '';
		};
	});

	$effect.pre(() => {
		if (!mounted || !storedInput) return;
		if (chatState.input === '') {
			storedInput.delete();
			return;
		}
		storedInput.value = chatState.input;
	});

	function handleRemoveAttachment(url: string) {
		chatState.removeAttachment(url);
	}

	$effect(() => {
		void chatState.input;
		scheduleInlineLayoutMeasurement();
	});

	$effect(() => {
		void c;
		scheduleInlineLayoutMeasurement();
	});

	$effect(() => {
		if (!(inputLayoutRef instanceof HTMLDivElement)) return;
		if (typeof ResizeObserver === 'undefined') return;

		const observer = new ResizeObserver(() => {
			scheduleInlineLayoutMeasurement();
		});
		observer.observe(inputLayoutRef);
		return () => {
			observer.disconnect();
		};
	});
</script>

<div class="relative flex w-full flex-col gap-4">
	{#if showWelcome}
		<div class="absolute inset-x-0 bottom-full mb-6 pb-4">
			<p
				class="text-foreground flex items-center justify-center gap-2 text-center text-2xl select-none"
			>
				{$t('chat.welcome')}
			</p>
		</div>
	{/if}

	<InputGroup.Root
		class={cn(
			'input-group-chat bg-chat-input text-chat-input-foreground border-border/80 h-auto flex-col items-stretch overflow-hidden border',
			'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.28)]',
			transitionsReady &&
				'transition-[border-radius,padding,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
			textareaExpanded ? 'rounded-4xl px-2.5 py-2.5' : 'rounded-[1.75rem] px-2.5 py-1.5'
		)}
		data-layout={textareaExpanded ? 'stacked' : 'inline'}
		onclick={handleFocus}
	>
		<div class="flex flex-col gap-2">
			{#if hasAttachments || uploadsInProgress}
				<div class="px-1 pt-1">
					<AttachmentList
						attachments={chatState.attachments}
						uploadQueue={chatState.uploadQueue}
						onremove={handleRemoveAttachment}
					/>
				</div>
			{/if}

			<div bind:this={inputLayoutRef} class="relative min-w-0">
				<div
					class={cn(
						'min-w-0',
						transitionsReady &&
							'transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
						textareaExpanded ? 'px-1.5 pt-0 pb-12' : 'py-0.5 ps-11 pe-11'
					)}
				>
					<TextareaAutosize
						bind:ref={textareaRef}
						id="chat-input"
						name="prompt"
						aria-label={$t('chat.input_aria_label')}
						aria-describedby={inputDescribedBy}
						placeholder={$t('chat.placeholder')}
						bind:value={() => chatState.input, setInput}
						class={cn(
							'placeholder:text-muted-foreground/80 w-full min-w-0 bg-transparent px-0 py-1.5 text-base leading-6 wrap-anywhere',
							transitionsReady &&
								'transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
							c
						)}
						minLines={chatInputMinLines}
						maxHeight={400}
						autofocus={!sidebar.isMobile}
						enterkeyhint="send"
						wrap="soft"
						onkeydown={handleKeyDown}
						onpaste={handlePaste}
					/>
				</div>

				<div
					class={cn(
						'absolute left-0 z-10 will-change-transform',
						transitionsReady &&
							'transition-[top,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
						textareaExpanded
							? 'top-[calc(100%-2.5rem)] translate-y-0 opacity-100'
							: 'top-1/2 left-0 -translate-y-1/2 opacity-100'
					)}
				>
					<AttachmentUploader
						disabled={loading}
						onchange={handleFileChange}
						onselectattachments={handleSelectAttachments}
					/>
				</div>

				<div
					class={cn(
						'absolute right-0 z-10 will-change-transform',
						transitionsReady &&
							'transition-[top,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
						textareaExpanded
							? 'top-[calc(100%-2.5rem)] translate-y-0 opacity-100'
							: 'top-1/2 right-0 -translate-y-1/2 opacity-100'
					)}
				>
					<SubmitControls status={submitStatus} {canSend} onsend={handleSend} onstop={handleStop} />
				</div>

				<div
					class="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-0"
					aria-hidden="true"
				>
					<div class="min-w-0 py-0.5 ps-11 pe-11">
						<textarea
							bind:this={inlineMeasureRef}
							class={cn(
								'w-full min-w-0 resize-none border-0 bg-transparent px-0 py-1.5 text-base leading-6 wrap-anywhere shadow-none outline-none',
								c
							)}
							rows={1}
							tabindex={-1}
							value={chatState.input || ' '}
							readonly
							wrap="soft"
							style="height: auto; min-height: 0; max-height: none; unicode-bidi: plaintext; text-align: start;"
						></textarea>
					</div>
				</div>
			</div>

			<p id={inputHintId} class="sr-only">
				{$t('chat.input_shortcuts_hint')}
			</p>
			<div id={inputStatusId} class="sr-only" aria-live="polite">
				{#if uploadsInProgress}
					{$t('common.uploading')}
				{:else if hasUnsupportedImageAttachments}
					{$t('models.vision_not_supported')}
				{/if}
			</div>
		</div>
	</InputGroup.Root>
</div>
