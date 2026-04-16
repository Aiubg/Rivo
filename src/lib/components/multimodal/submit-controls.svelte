<script lang="ts">
	import * as InputGroup from '$lib/components/ui/input-group';
	import Spinner from '$lib/components/ui/spinner.svelte';
	import StopIcon from '@lucide/svelte/icons/square';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import { t } from 'svelte-i18n';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/ui/tooltip';

	let {
		status = 'idle',
		canSend = false,
		onsend,
		onstop
	}: {
		status?: 'idle' | 'submitting' | 'streaming';
		canSend: boolean;
		onsend: () => void;
		onstop: () => void;
	} = $props();

	const submitButtonClass =
		'size-9 rounded-full shadow-none transition-[background-color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100';
</script>

{#if status === 'submitting'}
	<Tooltip>
		<TooltipTrigger>
			{#snippet child({ props })}
				<InputGroup.Button
					{...props}
					size="icon-sm"
					variant="default"
					class={submitButtonClass}
					aria-label={$t('chat.stop_output')}
					aria-busy="true"
					onclick={(event) => {
						event.preventDefault();
						onstop();
					}}
				>
					<Spinner class="border-primary-foreground/35 border-t-primary-foreground size-4" />
				</InputGroup.Button>
			{/snippet}
		</TooltipTrigger>
		<TooltipContent>
			{$t('chat.stop_output')}
		</TooltipContent>
	</Tooltip>
{:else if status === 'streaming'}
	<Tooltip>
		<TooltipTrigger>
			{#snippet child({ props })}
				<InputGroup.Button
					{...props}
					size="icon-sm"
					variant="default"
					class={submitButtonClass}
					aria-label={$t('chat.stop_output')}
					onclick={(event) => {
						event.preventDefault();
						onstop();
					}}
				>
					<StopIcon size={14} fill="currentColor" />
				</InputGroup.Button>
			{/snippet}
		</TooltipTrigger>
		<TooltipContent>
			{$t('chat.stop_output')}
		</TooltipContent>
	</Tooltip>
{:else if canSend}
	<Tooltip>
		<TooltipTrigger>
			{#snippet child({ props })}
				<InputGroup.Button
					{...props}
					size="icon-sm"
					variant="default"
					class={submitButtonClass}
					aria-label={$t('chat.send_message')}
					onclick={(event) => {
						event.preventDefault();
						onsend();
					}}
				>
					<ArrowUpIcon size={14} class="rtl-mirror" />
				</InputGroup.Button>
			{/snippet}
		</TooltipTrigger>
		<TooltipContent>
			{$t('chat.send_message')}
		</TooltipContent>
	</Tooltip>
{:else}
	<Tooltip>
		<TooltipTrigger>
			{#snippet child({ props })}
				<span {...props} class="inline-flex" aria-disabled="true">
					<InputGroup.Button
						size="icon-sm"
						variant="default"
						class={submitButtonClass}
						aria-label={$t('chat.enter_question')}
						onclick={(event) => {
							event.preventDefault();
						}}
						disabled={true}
					>
						<ArrowUpIcon size={14} class="rtl-mirror" />
					</InputGroup.Button>
				</span>
			{/snippet}
		</TooltipTrigger>
		<TooltipContent>
			{$t('chat.enter_question')}
		</TooltipContent>
	</Tooltip>
{/if}
