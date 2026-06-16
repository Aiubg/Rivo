<script lang="ts">
	import { ActiveChat } from '$lib/hooks/active-chat.svelte';
	import { t } from 'svelte-i18n';
	import CornerDownLeftIcon from '@lucide/svelte/icons/corner-down-left';
	import type { Snippet } from 'svelte';

	let {
		type,
		payload,
		children
	}: {
		type: string;
		payload: string;
		children?: Snippet;
	} = $props();

	const activeChat = ActiveChat.fromContext();

	const isBusy = $derived(
		activeChat?.state?.status === 'streaming' || activeChat?.state?.status === 'submitted'
	);
	const canSend = $derived(!!activeChat?.state);

	function handleAsk() {
		const state = activeChat?.state;
		if (!state) return;
		void state.handleSubmit(undefined, { content: payload });
	}
</script>

{#if type === 'ask'}
	{#if canSend}
		<button
			type="button"
			class="action-inline cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
			disabled={isBusy}
			onclick={handleAsk}
			aria-label={$t('chat.send_suggestion')}
		>
			{@render children?.()}<CornerDownLeftIcon
				size={14}
				class="action-inline-symbol"
				aria-hidden="true"
			/>
		</button>
	{:else}
		<span class="action-inline-static">
			{@render children?.()}<CornerDownLeftIcon
				size={14}
				class="action-inline-symbol"
				aria-hidden="true"
			/>
		</span>
	{/if}
{:else}
	{@render children?.()}
{/if}
