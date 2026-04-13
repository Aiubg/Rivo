<script lang="ts">
	import { cn } from '$lib/utils/shadcn';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import CheckIcon from '@lucide/svelte/icons/check';
	import Maximize2Icon from '@lucide/svelte/icons/maximize-2';
	import ZoomInIcon from '@lucide/svelte/icons/zoom-in';
	import ZoomOutIcon from '@lucide/svelte/icons/zoom-out';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import PlayIcon from '@lucide/svelte/icons/play';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import { Button } from '$lib/components/ui/button';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/ui/tooltip';
	import { onDestroy, type Component, type Snippet } from 'svelte';
	import { observePreForHighlight } from '$lib/utils/code';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';
	import { copyToClipboard } from '$lib/utils/misc';
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { getSearchSidebarContext } from '$lib/hooks/search-sidebar.svelte';

	let {
		class: className,
		children,
		streaming = false,
		...rest
	}: {
		class?: string;
		children?: Snippet;
		streaming?: boolean;
	} = $props();

	const sidebar = getSearchSidebarContext();
	let preEl = $state<HTMLPreElement | null>(null);
	type MermaidExports = {
		zoomIn: () => void;
		zoomOut: () => void;
		resetZoom: () => void;
		openFullscreen: () => void;
		downloadSvg: (filename?: string) => void;
		downloadPng: (filename?: string, minScale?: number) => void;
	};
	type MermaidStatus = {
		canInteract: boolean;
		canDownloadPng: boolean;
		canDownloadSvg: boolean;
		hasError: boolean;
	};
	const isMobileViewport = new IsMobile();
	let MermaidComponent = $state<Component<
		{ code: string; onstatuschange?: (status: MermaidStatus) => void },
		MermaidExports
	> | null>(null);
	let mermaidRef = $state<MermaidExports | null>(null);
	let mermaidStatus = $state<MermaidStatus>({
		canInteract: false,
		canDownloadPng: false,
		canDownloadSvg: false,
		hasError: false
	});
	let lang = $state<string>('Text');
	let codeContent = $state<string>('');
	let copied = $state(false);
	let activeTab = $state<'chart' | 'code'>('chart');
	let codeActionStatus = $state('');
	let codeActionStatusTimeout: ReturnType<typeof setTimeout> | null = null;

	let isMermaid = $derived(lang.toLowerCase() === 'mermaid');
	let hasCodeContent = $derived(codeContent.trim().length > 0);

	function setCodeActionStatus(message: string) {
		codeActionStatus = message;
		if (codeActionStatusTimeout) {
			clearTimeout(codeActionStatusTimeout);
		}
		if (!message) {
			codeActionStatusTimeout = null;
			return;
		}
		codeActionStatusTimeout = setTimeout(() => {
			codeActionStatus = '';
			codeActionStatusTimeout = null;
		}, 1500);
	}

	$effect(() => {
		if (!isMermaid || MermaidComponent) return;
		void (async () => {
			const mod = await import('$lib/components/markdown/mermaid.svelte');
			MermaidComponent = mod.default;
		})();
	});

	$effect(() => {
		if (!preEl) return;
		const stop = observePreForHighlight(preEl, (l, c) => {
			lang = l;
			codeContent = c;
		});
		return () => {
			stop?.();
		};
	});

	onDestroy(() => {
		if (codeActionStatusTimeout) {
			clearTimeout(codeActionStatusTimeout);
		}
	});

	async function handleCopy() {
		const codeEl = preEl?.querySelector('code');
		const text = codeEl?.textContent ?? '';
		const ok = await copyToClipboard(text);
		if (!ok) {
			setCodeActionStatus(get(t)('common.request_failed'));
			return;
		}
		copied = true;
		setCodeActionStatus(get(t)('common.copied_to_clipboard'));
		setTimeout(() => (copied = false), 1500);
	}

	function handleDownload(extensionOverride?: string, filenamePrefix = 'code') {
		const codeEl = preEl?.querySelector('code');
		const text = codeEl?.textContent ?? '';
		if (!text) return;
		const blob = new Blob([text], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		const extension =
			extensionOverride ?? (lang.toLowerCase() === 'text' ? 'txt' : lang.toLowerCase());
		a.href = url;
		a.download = `${filenamePrefix}-${Date.now()}.${extension}`;
		a.rel = 'noopener';
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function handleMermaidStatusChange(status: MermaidStatus) {
		mermaidStatus = status;
	}
</script>

<div class="markdown-code-block relative my-6 w-full rounded-xl">
	<output class="sr-only" aria-live="polite">{codeActionStatus}</output>
	<div
		class="markdown-code-header rounded-t-surface flex items-center justify-between px-4 py-2 text-xs"
	>
		<div class="flex items-center gap-2">
			{#if isMermaid}
				<div class="bg-accent flex items-center gap-1 rounded-xl p-1" role="tablist">
					<button
						type="button"
						class={cn(
							'tab-trigger rounded-xl p-2 text-xs leading-none',
							activeTab === 'chart' ? 'bg-background text-foreground' : 'hover:bg-background/50'
						)}
						role="tab"
						aria-selected={activeTab === 'chart'}
						onclick={() => (activeTab = 'chart')}
					>
						{$t('chat.chart')}
					</button>
					<button
						type="button"
						class={cn(
							'tab-trigger rounded-xl p-2 text-xs leading-none',
							activeTab === 'code' ? 'bg-background text-foreground' : 'hover:bg-background/50'
						)}
						role="tab"
						aria-selected={activeTab === 'code'}
						onclick={() => (activeTab = 'code')}
					>
						{$t('chat.code')}
					</button>
				</div>
			{:else}
				<span class="bg-primary/20 size-2 rounded-full"></span>
				<span class="font-mono font-medium tracking-wider uppercase opacity-70">{lang}</span>
			{/if}
		</div>
		<div class="flex items-center">
			{#if isMermaid && activeTab === 'chart' && !isMobileViewport.current}
				<Tooltip>
					<TooltipTrigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="sm"
								class="text-muted-foreground hover:text-foreground px-2 transition-colors"
								onclick={() => mermaidRef?.zoomIn()}
								aria-label={$t('chat.zoom_in')}
								disabled={streaming || !mermaidStatus.canInteract}
							>
								<ZoomInIcon size={14} />
							</Button>
						{/snippet}
					</TooltipTrigger>
					<TooltipContent>{$t('chat.zoom_in')}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="sm"
								class="text-muted-foreground hover:text-foreground px-2 transition-colors"
								onclick={() => mermaidRef?.zoomOut()}
								aria-label={$t('chat.zoom_out')}
								disabled={streaming || !mermaidStatus.canInteract}
							>
								<ZoomOutIcon size={14} />
							</Button>
						{/snippet}
					</TooltipTrigger>
					<TooltipContent>{$t('chat.zoom_out')}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="sm"
								class="text-muted-foreground hover:text-foreground px-2 transition-colors"
								onclick={() => mermaidRef?.resetZoom()}
								aria-label={$t('chat.reset_zoom')}
								disabled={streaming || !mermaidStatus.canInteract}
							>
								<RotateCcwIcon size={14} />
							</Button>
						{/snippet}
					</TooltipTrigger>
					<TooltipContent>{$t('chat.reset_zoom')}</TooltipContent>
				</Tooltip>

				<div class="bg-muted-foreground/30 mx-2 h-3 w-px"></div>
			{/if}

			{#if isMermaid && activeTab === 'chart'}
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-foreground gap-1 px-2 transition-colors"
					onclick={() => mermaidRef?.openFullscreen()}
					aria-label={$t('chat.fullscreen')}
					disabled={streaming || !mermaidStatus.canInteract}
				>
					<Maximize2Icon size={14} />
					<span class="text-xs">{$t('chat.fullscreen')}</span>
				</Button>
			{:else}
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-foreground gap-1 px-2 transition-colors"
					onclick={handleCopy}
					aria-label={copied ? $t('common.copied_to_clipboard') : $t('chat.copy')}
					disabled={streaming || !hasCodeContent}
				>
					{#if copied}
						<CheckIcon size={14} />
					{:else}
						<CopyIcon size={14} />
					{/if}
					<span class="text-xs">{$t('chat.copy')}</span>
				</Button>
			{/if}

			{#if isMermaid}
				<DropdownMenu>
					<DropdownMenuTrigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="sm"
								class="text-muted-foreground hover:text-foreground gap-1 px-2 transition-colors"
								aria-label={$t('chat.download')}
								disabled={streaming || !hasCodeContent}
							>
								<DownloadIcon size={14} />
								<span class="text-xs">{$t('chat.download')}</span>
							</Button>
						{/snippet}
					</DropdownMenuTrigger>
					<DropdownMenuContent side="bottom" align="end" class="min-w-32">
						<DropdownMenuItem
							class="cursor-pointer"
							disabled={streaming || !mermaidStatus.canDownloadSvg}
							onSelect={() => mermaidRef?.downloadSvg()}
						>
							<span>{$t('chat.download_svg')}</span>
						</DropdownMenuItem>
						<DropdownMenuItem
							class="cursor-pointer"
							disabled={streaming || !mermaidStatus.canDownloadPng}
							onSelect={() => mermaidRef?.downloadPng()}
						>
							<span>{$t('chat.download_png')}</span>
						</DropdownMenuItem>
						<DropdownMenuItem
							class="cursor-pointer"
							disabled={streaming || !hasCodeContent}
							onSelect={() => handleDownload('mmd', 'mermaid')}
						>
							<span>{$t('chat.download_code')}</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			{:else}
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-foreground gap-1 px-2 transition-colors"
					onclick={() => handleDownload()}
					aria-label={$t('chat.download')}
					disabled={streaming || !hasCodeContent}
				>
					<DownloadIcon size={14} />
					<span class="text-xs">{$t('chat.download')}</span>
				</Button>
			{/if}

			{#if lang.toLowerCase() === 'html'}
				<div class="bg-muted-foreground/30 mx-2 h-3 w-px"></div>
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-foreground gap-1 px-2 transition-colors"
					onclick={() => sidebar?.openHtml(codeContent)}
					aria-label={$t('chat.run')}
					disabled={streaming || !hasCodeContent}
				>
					<PlayIcon size={14} />
					<span class="text-xs">{$t('chat.run')}</span>
				</Button>
			{/if}
		</div>
	</div>
	{#if isMermaid}
		<div class="overflow-hidden">
			<div
				class={cn(activeTab !== 'chart' && 'hidden')}
				role="tabpanel"
				aria-hidden={activeTab !== 'chart'}
			>
				{#if MermaidComponent}
					<MermaidComponent
						bind:this={mermaidRef}
						code={codeContent}
						onstatuschange={handleMermaidStatusChange}
					/>
				{:else}
					<div class="flex-center flex-col gap-2 p-8" role="status" aria-live="polite">
						<div
							class="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
						></div>
						<span class="text-muted-foreground text-sm">{$t('common.loading')}</span>
					</div>
				{/if}
			</div>
			<div role="tabpanel" aria-hidden={activeTab !== 'code'}>
				<pre
					bind:this={preEl}
					class={cn(
						'hljs rounded-b-surface w-full border-0 bg-transparent px-4 py-4 text-sm leading-relaxed',
						activeTab !== 'code' && 'hidden',
						className
					)}>{@render children?.()}</pre>
			</div>
		</div>
	{:else}
		<pre
			bind:this={preEl}
			{...rest}
			class={cn(
				'hljs w-full rounded-xl border-0 bg-transparent px-4 py-4 text-sm leading-relaxed',
				className
			)}>{@render children?.()}</pre>
	{/if}
</div>
