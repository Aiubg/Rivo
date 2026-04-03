<script lang="ts">
	import { get } from 'svelte/store';
	import { t, date } from 'svelte-i18n';
	import { cn } from '$lib/utils/shadcn';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/ui/tooltip';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Resizable from '$lib/components/ui/resizable';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import * as Empty from '$lib/components/ui/empty';
	import Spinner from '$lib/components/ui/spinner.svelte';
	import FilePreviewContent from '$lib/components/file-preview-content.svelte';
	import SidebarToggle from '$lib/components/sidebar-toggle.svelte';
	import { useSidebar } from '$lib/components/ui/sidebar';
	import { FileLibraryState } from '$lib/hooks/file-library-state.svelte';
	import { formatFileSize } from '$lib/utils/files';
	import FileIcon from '@lucide/svelte/icons/file';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import MoreHorizontalIcon from '@lucide/svelte/icons/more-horizontal';
	import ListFilterIcon from '@lucide/svelte/icons/list-filter';
	import ArrowUpDownIcon from '@lucide/svelte/icons/arrow-up-down';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';
	import type { Component } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDateTime(value: number): string {
		return get(date)(new Date(value), {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	let paneGroup = $state<import('paneforge').PaneGroup>();
	const sidebar = useSidebar();
	const sidebarExpanded = $derived(sidebar.isMobile ? sidebar.openMobile : sidebar.open);
	const fileLibraryState = $derived(new FileLibraryState(data.files));
	const files = $derived(fileLibraryState.files);
	const visibleFiles = $derived(fileLibraryState.visibleFiles);
	const selectedFile = $derived(fileLibraryState.selectedFile);

	$effect(() => {
		fileLibraryState.syncSelectionWithVisibleFiles();
	});

	$effect(() => {
		void fileLibraryState.ensureSelectedPreviewLoaded();
	});

	$effect(() => {
		fileLibraryState.syncDeleteDialogState();
	});

	$effect(() => {
		void fileLibraryState.syncRenameDialogState();
	});
</script>

<input
	type="file"
	class="hidden"
	bind:this={fileLibraryState.uploadInputRef}
	multiple
	onchange={fileLibraryState.handleUploadChange}
	tabindex={-1}
	aria-hidden="true"
	accept="text/*,application/json,application/javascript,.py,.ts,.tsx,.jsx,.md,.yaml,.yml,.toml,.txt,.docx,.xlsx"
/>

{#snippet filesListPanel()}
	{#snippet SelectableMenuItem({
		label,
		selected,
		onSelect
	}: {
		label: string;
		selected: boolean;
		onSelect: () => void;
	})}
		<DropdownMenuItem onclick={onSelect}>
			<span class="flex-1">{label}</span>
			{#if selected}
				<CheckIcon size={14} />
			{/if}
		</DropdownMenuItem>
	{/snippet}

	<div class="flex h-full min-h-0 flex-col overflow-hidden">
		<div class="flex min-h-10 flex-row items-center justify-between p-2">
			<div class="inline-flex items-center gap-1 p-2">
				{#if sidebar.isMobile || !sidebarExpanded}
					<SidebarToggle />
				{/if}
				<h1 class="text-base font-semibold select-none">{$t('files.title')}</h1>
			</div>
			<div class="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon-sm"
								onclick={fileLibraryState.refreshFiles}
								disabled={fileLibraryState.refreshing || fileLibraryState.uploading}
								aria-label={$t('files.refresh')}
							>
								{#if fileLibraryState.refreshing}
									<Spinner class="size-4" />
								{:else}
									<RefreshCwIcon size={16} />
								{/if}
							</Button>
						{/snippet}
					</TooltipTrigger>
					<TooltipContent>{$t('files.refresh')}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon-sm"
								onclick={fileLibraryState.openUploadPicker}
								disabled={fileLibraryState.uploading}
								aria-label={$t('files.upload')}
							>
								{#if fileLibraryState.uploading}
									<Spinner class="size-4" />
								{:else}
									<PlusIcon size={16} />
								{/if}
							</Button>
						{/snippet}
					</TooltipTrigger>
					<TooltipContent>{$t('files.upload')}</TooltipContent>
				</Tooltip>
			</div>
		</div>
		<div class="flex items-center gap-2 px-2 pb-2">
			<div class="flex items-center gap-1">
				<div
					class="ui-border-control bg-background inline-flex h-8 w-fit items-center overflow-hidden rounded-full"
				>
					<DropdownMenu>
						<DropdownMenuTrigger>
							{#snippet child({ props })}
								<button
									{...props}
									type="button"
									class={cn(
										'ui-focus-ring hover:bg-accent hover:text-accent-foreground inline-flex h-8 shrink-0 items-center gap-2 text-sm font-medium transition-colors outline-none',
										fileLibraryState.activeFilter ? 'rounded-s-full ps-3 pe-2' : 'rounded-full px-3'
									)}
									aria-label={$t('files.filter')}
								>
									<ListFilterIcon size={14} />
									<span class="select-none">
										{fileLibraryState.activeFilter
											? $t(`files.filter_${fileLibraryState.activeFilter}`)
											: $t('files.filter')}
									</span>
								</button>
							{/snippet}
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" class="min-w-36">
							{@render SelectableMenuItem({
								label: $t('files.filter_text'),
								selected: fileLibraryState.activeFilter === 'text',
								onSelect: () => (fileLibraryState.activeFilter = 'text')
							})}
							{@render SelectableMenuItem({
								label: $t('files.filter_image'),
								selected: fileLibraryState.activeFilter === 'image',
								onSelect: () => (fileLibraryState.activeFilter = 'image')
							})}
							{@render SelectableMenuItem({
								label: $t('files.filter_office'),
								selected: fileLibraryState.activeFilter === 'office',
								onSelect: () => (fileLibraryState.activeFilter = 'office')
							})}
						</DropdownMenuContent>
					</DropdownMenu>
					{#if fileLibraryState.activeFilter !== null}
						<div class="bg-border h-4 w-px shrink-0"></div>
						<button
							type="button"
							class="ui-focus-ring hover:bg-accent hover:text-accent-foreground flex h-full shrink-0 items-center justify-center rounded-e-full px-2 transition-colors outline-none"
							aria-label={$t('files.clear_filter')}
							onpointerdown={fileLibraryState.clearFilter}
							onclick={fileLibraryState.clearFilter}
						>
							<XIcon size={12} />
						</button>
					{/if}
				</div>
			</div>

			<DropdownMenu>
				<DropdownMenuTrigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="sm" class="h-8 rounded-full px-3">
							<ArrowUpDownIcon size={14} />
							<span>{$t('files.sort')}</span>
						</Button>
					{/snippet}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" class="min-w-36">
					{@render SelectableMenuItem({
						label: $t('files.sort_size'),
						selected: fileLibraryState.sortMode === 'size',
						onSelect: () => (fileLibraryState.sortMode = 'size')
					})}
					{@render SelectableMenuItem({
						label: $t('files.sort_name'),
						selected: fileLibraryState.sortMode === 'name',
						onSelect: () => (fileLibraryState.sortMode = 'name')
					})}
					{@render SelectableMenuItem({
						label: $t('files.sort_created'),
						selected: fileLibraryState.sortMode === 'created',
						onSelect: () => (fileLibraryState.sortMode = 'created')
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
		{#if files.length === 0}
			<Empty.State class="flex-1" title={$t('files.no_files')} icon={FileIcon} />
		{:else if visibleFiles.length === 0}
			<Empty.State class="flex-1" title={$t('files.no_filtered_files')} icon={ListFilterIcon} />
		{:else}
			<div class="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
				{#each visibleFiles as file (file.url)}
					<div class="group/item relative">
						<button
							type="button"
							class="ui-focus-ring hover:bg-muted data-[active=true]:bg-muted flex w-full min-w-0 flex-col items-start gap-1 rounded-lg px-3 py-2 pe-10 text-left outline-none"
							onclick={() => {
								fileLibraryState.selectedUrl = file.url;
							}}
							data-active={file.url === fileLibraryState.selectedUrl}
						>
							<div class="text-foreground w-full truncate text-sm font-medium">
								{file.originalName}
							</div>
							<div class="text-muted-foreground flex items-center gap-1 text-xs">
								<span>{formatFileSize(file.size)}</span>
								<span>|</span>
								<span>{formatDateTime(file.lastModified)}</span>
							</div>
						</button>
						<DropdownMenu
							open={fileLibraryState.openFileMenuUrl === file.url}
							onOpenChange={(open) => {
								fileLibraryState.openFileMenuUrl = open ? file.url : null;
							}}
						>
							<DropdownMenuTrigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="ghost"
										size="icon-sm"
										class="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2 opacity-100 transition-opacity data-[state=open]:opacity-100 md:opacity-0 md:group-hover/item:opacity-100"
										aria-label={$t('history.more')}
									>
										<MoreHorizontalIcon size={16} />
									</Button>
								{/snippet}
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" side="bottom">
								<DropdownMenuItem
									onclick={(event) => {
										event.preventDefault();
										event.stopPropagation();
										fileLibraryState.requestRename(file);
									}}
								>
									<PencilIcon size={16} />
									<span>{$t('files.rename')}</span>
								</DropdownMenuItem>
								<DropdownMenuItem
									variant="destructive"
									onclick={(event) => {
										event.preventDefault();
										event.stopPropagation();
										fileLibraryState.requestDelete(file);
									}}
								>
									<Trash2Icon size={16} />
									<span>{$t('files.delete')}</span>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet filePreviewPanel()}
	{#if selectedFile}
		{#snippet PreviewActionButton({
			label,
			onClick,
			disabled = false,
			Icon
		}: {
			label: string;
			onClick: () => void;
			disabled?: boolean;
			Icon: Component<{ size?: number }>;
		})}
			<Tooltip>
				<TooltipTrigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							onclick={onClick}
							{disabled}
							aria-label={label}
						>
							<Icon size={14} />
						</Button>
					{/snippet}
				</TooltipTrigger>
				<TooltipContent>{label}</TooltipContent>
			</Tooltip>
		{/snippet}

		<div class="flex h-full min-h-0 flex-col">
			<div class="flex items-center justify-between gap-3 px-4 py-3">
				<div class="flex min-w-0 items-center gap-2">
					<FileIcon size={16} class="shrink-0" />
					<div class="min-w-0">
						<div class="truncate text-sm font-medium">{selectedFile.originalName}</div>
					</div>
				</div>
				<div class="flex items-center gap-1">
					{@render PreviewActionButton({
						label: $t('common.copy'),
						onClick: fileLibraryState.copySelectedFileContent,
						disabled: selectedFile.previewLoading,
						Icon: CopyIcon
					})}
					{@render PreviewActionButton({
						label: $t('common.download'),
						onClick: fileLibraryState.downloadSelectedFile,
						Icon: DownloadIcon
					})}
					{@render PreviewActionButton({
						label: $t('common.close'),
						onClick: fileLibraryState.closeSelectedPreview,
						Icon: XIcon
					})}
				</div>
			</div>
			<FilePreviewContent
				name={selectedFile.originalName}
				url={selectedFile.url}
				contentType={selectedFile.contentType}
				content={selectedFile.previewContent ?? null}
				loading={selectedFile.previewLoading}
			/>
		</div>
	{/if}
{/snippet}

<div class="flex h-full w-full overflow-hidden">
	{#if sidebar.isMobile}
		<div class="flex h-full min-h-0 w-full flex-col overflow-hidden">
			{@render filesListPanel()}
		</div>
		<Sheet.Root
			open={!!selectedFile}
			onOpenChange={(open) => {
				if (!open) fileLibraryState.closeSelectedPreview();
			}}
		>
			<Sheet.Content
				side="bottom"
				class="rounded-t-dialog flex h-[95dvh] flex-col gap-0 overflow-hidden border-0 p-0"
				hideClose={true}
			>
				{@render filePreviewPanel()}
			</Sheet.Content>
		</Sheet.Root>
	{:else}
		<Resizable.PaneGroup direction="horizontal" autoSaveId="rivo-files-layout" bind:paneGroup>
			<Resizable.Pane defaultSize={28} minSize={18} maxSize={45}>
				{@render filesListPanel()}
			</Resizable.Pane>

			<Resizable.Handle
				ondblclick={() => {
					paneGroup?.setLayout([28, 72]);
				}}
			/>

			<Resizable.Pane defaultSize={72} minSize={40}>
				<div class="bg-background h-full min-h-0 overflow-hidden">
					{#if !selectedFile}
						<Empty.State class="h-full" title={$t('files.preview_placeholder')} icon={FileIcon} />
					{:else}
						{@render filePreviewPanel()}
					{/if}
				</div>
			</Resizable.Pane>
		</Resizable.PaneGroup>
	{/if}
</div>

<AlertDialog bind:open={fileLibraryState.deleteDialogOpen}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>{$t('files.delete')}</AlertDialogTitle>
			<AlertDialogDescription>
				{$t('files.delete_confirm')}
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel
				onclick={() => {
					fileLibraryState.fileToDelete = null;
				}}>{$t('common.cancel')}</AlertDialogCancel
			>
			<AlertDialogAction variant="destructive" onclick={fileLibraryState.confirmDelete}
				>{$t('common.confirm')}</AlertDialogAction
			>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>

<AlertDialog bind:open={fileLibraryState.renameDialogOpen}>
	<AlertDialogContent
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			void fileLibraryState.focusRenameInput();
		}}
	>
		<AlertDialogHeader>
			<AlertDialogTitle>{$t('files.rename')}</AlertDialogTitle>
		</AlertDialogHeader>
		<div>
			<div class="flex items-center gap-1">
				<Input
					placeholder={$t('files.rename_placeholder')}
					bind:value={fileLibraryState.renameValue}
					bind:ref={fileLibraryState.renameInputRef}
					autofocus
					aria-label={$t('files.rename')}
					onkeydown={(event) => {
						if (event.key === 'Enter') {
							void fileLibraryState.confirmRename();
						}
					}}
				/>
				{#if fileLibraryState.renameExtension}
					<span class="text-muted-foreground rounded-md border px-3 py-2 text-sm select-none">
						{fileLibraryState.renameExtension}
					</span>
				{/if}
			</div>
		</div>
		<AlertDialogFooter>
			<AlertDialogCancel
				onclick={() => {
					fileLibraryState.fileToRename = null;
				}}>{$t('common.cancel')}</AlertDialogCancel
			>
			<AlertDialogAction onclick={fileLibraryState.confirmRename}
				>{$t('common.confirm')}</AlertDialogAction
			>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
