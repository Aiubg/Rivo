<script lang="ts">
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { date, t } from 'svelte-i18n';
	import { toast } from 'svelte-sonner';
	import { AlertDialog, AlertDialogContent } from '$lib/components/ui/alert-dialog';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import Spinner from '$lib/components/ui/spinner.svelte';
	import type { Attachment } from '$lib/types/attachment';
	import { fetchStoredFiles, type StoredUploadFile } from '$lib/services/files-api';
	import {
		isStoredImageFile,
		resolveStoredFileAttachment
	} from '$lib/services/stored-file-attachment';
	import { isOfficeDocument } from '$lib/utils/files';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import CheckIcon from '@lucide/svelte/icons/check';
	import FileImageIcon from '@lucide/svelte/icons/file-image';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';

	let {
		open = $bindable(false),
		disabled = false,
		mobile = false,
		supportsVisionInput = true,
		onselect
	}: {
		open: boolean;
		disabled?: boolean;
		mobile?: boolean;
		supportsVisionInput?: boolean;
		onselect: (attachments: Attachment[]) => void;
	} = $props();

	let loading = $state(false);
	let submitting = $state(false);
	let query = $state('');
	let files = $state<StoredUploadFile[]>([]);
	let selectedUrls = $state<string[]>([]);
	let requestedForCurrentOpen = $state(false);
	const previewCache = new Map<string, string | null>();

	const filteredFiles = $derived.by(() => {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) return files;
		return files.filter((file) => file.originalName.toLowerCase().includes(normalizedQuery));
	});
	const selectedCount = $derived(selectedUrls.length);
	const selectedFiles = $derived.by(() => {
		const selectedUrlSet = new Set(selectedUrls);
		return files.filter((file) => selectedUrlSet.has(file.url));
	});

	function formatDateTime(value: number): string {
		return get(date)(new Date(value), {
			month: 'numeric',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function closePicker() {
		open = false;
	}

	function toggleSelection(file: StoredUploadFile) {
		if (disabled || submitting) return;
		if (!supportsVisionInput && isStoredImageFile(file)) {
			toast.error(get(t)('models.vision_not_supported'));
			return;
		}

		selectedUrls = selectedUrls.includes(file.url)
			? selectedUrls.filter((url) => url !== file.url)
			: [...selectedUrls, file.url];
	}

	function getFileIcon(file: StoredUploadFile) {
		if (isStoredImageFile(file)) return FileImageIcon;
		if (isOfficeDocument(file.originalName, file.contentType)) return FileSpreadsheetIcon;
		return FileTextIcon;
	}

	async function loadFiles() {
		if (loading) return;

		loading = true;
		try {
			const storedFiles = await fetchStoredFiles();
			files = storedFiles.sort((a, b) => b.uploadedAt - a.uploadedAt);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'upload.failed';
			toast.error(get(t)(message.includes('.') ? message : 'upload.failed'));
		} finally {
			loading = false;
		}
	}

	async function confirmSelection() {
		if (disabled || submitting || selectedFiles.length === 0) return;

		submitting = true;
		try {
			const attachments = await Promise.all(
				selectedFiles.map(async (file) => {
					try {
						return await resolveStoredFileAttachment(file, previewCache);
					} catch (error) {
						const message = error instanceof Error ? error.message : 'upload.failed';
						toast.error(get(t)(message.includes('.') ? message : 'upload.failed'));
						return null;
					}
				})
			);
			const resolvedAttachments = attachments.filter(
				(attachment): attachment is Attachment => attachment !== null
			);
			if (resolvedAttachments.length === 0) return;
			onselect(resolvedAttachments);
			closePicker();
		} finally {
			submitting = false;
		}
	}

	$effect(() => {
		if (!open) {
			query = '';
			selectedUrls = [];
			submitting = false;
			requestedForCurrentOpen = false;
			return;
		}

		if (requestedForCurrentOpen) {
			return;
		}

		requestedForCurrentOpen = true;
		untrack(() => {
			void loadFiles();
		});
	});
</script>

{#snippet pickerContent()}
	<div class="flex h-full min-h-0 flex-col">
		<div class="flex items-center gap-3 px-5 py-4">
			<h3 class="flex-1 text-lg font-semibold select-none">{$t('files.add_from_library')}</h3>
			<Button
				variant="ghost"
				size="icon"
				class="size-8"
				onclick={closePicker}
				aria-label={$t('common.close')}
			>
				<XIcon class="size-5" />
			</Button>
		</div>

		<div class="border-b px-5 py-4">
			<div class="flex items-center gap-2">
				<SearchIcon class="text-muted-foreground size-5 shrink-0" />
				<input
					bind:value={query}
					class="placeholder:text-muted-foreground flex-1 bg-transparent text-base outline-none"
					placeholder={$t('files.search_library_placeholder')}
					aria-label={$t('files.search_library_placeholder')}
				/>
			</div>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
			{#if loading}
				<div class="flex h-full items-center justify-center">
					<Spinner class="size-6" />
				</div>
			{:else if files.length === 0}
				<Empty.State class="h-full" title={$t('files.no_files')} icon={FileTextIcon} />
			{:else if filteredFiles.length === 0}
				<Empty.State class="h-full" title={$t('files.no_matching_files')} icon={SearchIcon} />
			{:else}
				<div class="flex flex-col gap-1">
					{#each filteredFiles as file (file.url)}
						{@const Icon = getFileIcon(file)}
						<button
							type="button"
							class="ui-focus-ring hover:bg-accent data-[selected=true]:bg-accent/70 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors outline-none"
							data-selected={selectedUrls.includes(file.url)}
							onclick={() => {
								toggleSelection(file);
							}}
						>
							<div
								class="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg"
							>
								<Icon class="size-5" />
							</div>
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium select-none">{file.originalName}</div>
								<div class="text-muted-foreground mt-1 text-xs select-none">
									{$t('files.last_modified')}
									{formatDateTime(file.lastModified)}
								</div>
							</div>
							<div
								class="border-muted-foreground/30 bg-background flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors data-[selected=true]:border-transparent data-[selected=true]:bg-(--color-foreground)"
								data-selected={selectedUrls.includes(file.url)}
							>
								<CheckIcon
									class="text-background size-3.5 opacity-0 transition-opacity data-[selected=true]:opacity-100"
									data-selected={selectedUrls.includes(file.url)}
								/>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<div class="bg-background/95 px-5 py-4 backdrop-blur-sm">
			<div class="flex items-center justify-between gap-3">
				<div class="text-muted-foreground text-sm select-none">
					{$t('files.selected_count', { values: { count: selectedCount } })}
				</div>
				<div class="flex items-center gap-2">
					<Button variant="outline" onclick={closePicker} disabled={submitting}>
						{$t('common.cancel')}
					</Button>
					<Button
						onclick={confirmSelection}
						disabled={selectedCount === 0 || disabled || submitting}
						class="min-w-28 gap-2"
					>
						{#if submitting}
							<Spinner class="size-4" />
						{/if}
						{$t('files.add_selected')}
					</Button>
				</div>
			</div>
		</div>
	</div>
{/snippet}

{#if mobile}
	<Sheet.Root bind:open>
		<Sheet.Content
			side="bottom"
			class="rounded-t-dialog flex h-[92dvh] flex-col gap-0 overflow-hidden border-0 p-0"
			hideClose={true}
		>
			{@render pickerContent()}
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<AlertDialog bind:open>
		<AlertDialogContent
			class="flex h-[min(82vh,44rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0"
		>
			{@render pickerContent()}
		</AlertDialogContent>
	</AlertDialog>
{/if}
