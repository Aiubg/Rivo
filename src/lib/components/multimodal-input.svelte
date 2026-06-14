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
	import { modelSupportsThinkingMode, modelSupportsVision } from '$lib/ai/model-registry';
	import { SelectedModel } from '$lib/hooks/selected-model.svelte';
	import type { ChatState } from '$lib/hooks/chat-state.svelte';
	import type { Attachment } from '$lib/types/attachment';
	import { isAllowedUploadFile, isUploadImageFile } from '$lib/utils/upload-constraints';
	import AtomIcon from '@lucide/svelte/icons/atom';
	import XIcon from '@lucide/svelte/icons/x';

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
	let composerRootEl = $state(null) as HTMLDivElement | null;
	let composerBoxEl = $state(null) as HTMLDivElement | null;
	let composerHeight = $state(0);
	let composerBaselineHeight = $state(0);
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
	const supportsThinkingMode = $derived(modelSupportsThinkingMode(selectedChatModel.value));
	const thinkingEnabled = $derived(chatState.modelOptions.thinking?.mode === 'enabled');
	const inputUsesStackedLayout = $derived(textareaExpanded || thinkingEnabled);
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
	// On the welcome page the composer is vertically centered. Freeze its box height to
	// the single-line baseline so the centered position never moves; taller content
	// (extra lines, attachments, thinking mode) overflows downward only, keeping the top
	// edge and the welcome heading above it fixed. Because the anchor is the frozen
	// baseline — never the live, animating height — the top stays put even mid-collapse.
	// In an existing chat the composer is bottom-pinned, so no anchor is applied.
	const welcomeAnchorHeight = $derived(
		showWelcome && composerBaselineHeight > 0 ? composerBaselineHeight : 0
	);
	const chatInputMinLines = 1;
	const chatInputLayoutHysteresisPx = 2;

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
		const overflow = inlineMeasureRef.scrollHeight - singleLineHeight;
		const shouldExpand = textareaExpanded
			? overflow > chatInputLayoutHysteresisPx / 2
			: overflow > chatInputLayoutHysteresisPx;

		if (textareaExpanded !== shouldExpand) {
			textareaExpanded = shouldExpand;
		}
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

	function toggleThinkingMode() {
		if (!supportsThinkingMode || loading) return;
		chatState.modelOptions = thinkingEnabled ? {} : { thinking: { mode: 'enabled' } };
	}

	function disableThinkingMode() {
		chatState.modelOptions = {};
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
			const allowedFiles = files.filter((file) => isAllowedUploadFile(file));
			if (allowedFiles.length !== files.length) {
				toast.error(get(t)('upload.file_type_not_allowed'));
			}
			const imageFiles = allowedFiles.filter((file) => isUploadImageFile(file));
			const blockedByVision = !supportsVisionInput && imageFiles.length > 0;
			if (blockedByVision) {
				toast.error(get(t)('models.vision_not_supported'));
			}
			const acceptedFiles = blockedByVision
				? allowedFiles.filter((file) => !isUploadImageFile(file))
				: allowedFiles;
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
		if (!supportsThinkingMode && thinkingEnabled) {
			disableThinkingMode();
		}
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

	$effect(() => {
		if (!(composerBoxEl instanceof HTMLDivElement)) return;
		const el = composerBoxEl;
		const measure = () => {
			composerHeight = el.offsetHeight;
		};
		measure();
		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => {
			observer.disconnect();
		};
	});

	// Capture the single-line composer height once so the centered welcome slot
	// stays fixed while the live composer grows and shrinks underneath it.
	$effect(() => {
		if (inputUsesStackedLayout || hasAttachments || uploadsInProgress) return;
		if (composerHeight <= 0) return;
		if (composerBaselineHeight === 0) {
			composerBaselineHeight = composerHeight;
		}
	});

	// A viewport change (e.g. browser zoom or font-size change) can legitimately
	// alter the single-line height. Re-sample directly on resize, when static.
	$effect(() => {
		if (typeof window === 'undefined') return;
		const onResize = () => {
			if (inputUsesStackedLayout || hasAttachments || uploadsInProgress) return;
			if (composerHeight > 0) composerBaselineHeight = composerHeight;
		};
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

</script>

<div
	bind:this={composerRootEl}
	class={cn('relative flex w-full flex-col gap-4', welcomeAnchorHeight > 0 && 'block', c)}
	style:height={welcomeAnchorHeight > 0 ? `${welcomeAnchorHeight}px` : null}
>
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
		bind:ref={composerBoxEl}
		class={cn(
			'input-group-chat bg-chat-input text-chat-input-foreground chat-composer h-auto flex-col items-stretch overflow-hidden border',
			welcomeAnchorHeight > 0 && 'absolute inset-x-0 top-0',
			transitionsReady &&
				'transition-[padding] duration-300 ease-emphasized motion-reduce:transition-none'
		)}
		data-layout={inputUsesStackedLayout ? 'stacked' : 'inline'}
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
						'chat-composer-inner min-w-0',
						transitionsReady &&
							'transition-[padding] duration-300 ease-emphasized motion-reduce:transition-none'
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
							'placeholder:text-muted-foreground/80 chat-composer-textarea w-full min-w-0 bg-transparent px-0 text-base leading-6 wrap-anywhere',
							transitionsReady &&
								'transition-[padding] duration-300 ease-emphasized motion-reduce:transition-none'
						)}
						minLines={chatInputMinLines}
						maxHeight={240}
						autofocus={!sidebar.isMobile}
						enterkeyhint="send"
						wrap="soft"
						onkeydown={handleKeyDown}
						onpaste={handlePaste}
					/>
				</div>

				<div
					class={cn(
						'chat-composer-actions absolute left-0 z-10 flex max-w-[calc(100%-3rem)] items-center gap-1',
						transitionsReady &&
							'transition-opacity duration-300 ease-emphasized motion-reduce:transition-none'
					)}
				>
					<AttachmentUploader
						disabled={loading}
						{supportsThinkingMode}
						{thinkingEnabled}
						onchange={handleFileChange}
						onselectattachments={handleSelectAttachments}
						ontogglethinking={toggleThinkingMode}
					/>

					{#if thinkingEnabled}
						<button
							type="button"
							class="group/thinking bg-muted text-accent-foreground hover:bg-accent inline-flex h-9 min-w-0 items-center gap-2 rounded-full px-3 text-sm font-medium transition-[background-color,border-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60"
							aria-label={$t('chat.disable_deep_thinking')}
							disabled={loading}
							onclick={(event) => {
								event.stopPropagation();
								disableThinkingMode();
							}}
						>
							<AtomIcon
								class="size-4 shrink-0 group-hover/thinking:hidden group-focus-visible/thinking:hidden"
							/>
							<XIcon
								class="hidden size-4 shrink-0 group-hover/thinking:block group-focus-visible/thinking:block"
							/>
							<span class="min-w-0 truncate">{$t('chat.deep_thinking_badge')}</span>
						</button>
					{/if}
				</div>

				<div
					class={cn(
						'chat-composer-actions absolute right-0 z-10',
						transitionsReady &&
							'transition-opacity duration-300 ease-emphasized motion-reduce:transition-none'
					)}
				>
					<SubmitControls status={submitStatus} {canSend} onsend={handleSend} onstop={handleStop} />
				</div>

				<div
					class="chat-composer-measure pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-0"
					aria-hidden="true"
				>
					<div class="chat-composer-inner min-w-0">
						<textarea
							bind:this={inlineMeasureRef}
							class={cn(
								'chat-composer-textarea w-full min-w-0 resize-none border-0 bg-transparent px-0 text-base leading-6 wrap-anywhere shadow-none outline-none'
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
