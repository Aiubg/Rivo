<script lang="ts">
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/ui/tooltip';
	import { cn } from '$lib/utils/shadcn';
	import { copyToClipboard } from '$lib/utils/misc';
	import { logger } from '$lib/utils/logger';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import { t } from 'svelte-i18n';
	import type { Snippet } from 'svelte';

	let {
		href,
		class: className = '',
		children
	}: {
		href: string;
		class?: string;
		children?: Snippet;
	} = $props();

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	async function handleCopy() {
		try {
			const success = await copyToClipboard(href);
			if (!success) return;
			copied = true;
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => {
				copied = false;
			}, 1500);
		} catch (e) {
			logger.error('Failed to copy link', e);
		}
	}
</script>

<Tooltip>
	<TooltipTrigger>
		{#snippet child({ props: triggerProps })}
			<a
				{...triggerProps}
				{href}
				class={cn('action-inline', className)}
				target="_blank"
				rel="noopener noreferrer"
			>
				{@render children?.()}<ArrowUpRightIcon
					size={14}
					class="action-inline-symbol"
					aria-hidden="true"
				/>
			</a>
		{/snippet}
	</TooltipTrigger>
	<TooltipContent class="citation-card max-w-80 p-2" side="top" sideOffset={8}>
		<div class="flex items-center gap-2">
			<span class="text-muted-foreground min-w-0 flex-1 truncate text-xs">{href}</span>
			<button
				type="button"
				class="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/50 inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
				onclick={handleCopy}
				aria-label={$t('chat.copy_link')}
			>
				{#if copied}
					<CheckIcon size={14} />
				{:else}
					<CopyIcon size={14} />
				{/if}
			</button>
		</div>
	</TooltipContent>
</Tooltip>
