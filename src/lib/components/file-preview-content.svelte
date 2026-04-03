<script lang="ts">
	import Spinner from '$lib/components/ui/spinner.svelte';
	import { t } from 'svelte-i18n';

	let {
		name = null,
		url = null,
		contentType = null,
		content = null,
		loading = false
	}: {
		name?: string | null;
		url?: string | null;
		contentType?: string | null;
		content?: string | null;
		loading?: boolean;
	} = $props();
</script>

<div
	class="bg-background min-h-0 flex-1 overflow-auto p-4"
	role="region"
	aria-label={name ? `${$t('chat.preview')}: ${name}` : $t('chat.preview')}
>
	{#if loading}
		<div
			class="text-muted-foreground flex h-full items-center justify-center text-sm"
			role="status"
			aria-live="polite"
		>
			<Spinner class="size-4" />
			<span class="ml-2">{$t('common.loading')}</span>
		</div>
	{:else if contentType?.startsWith('image/') && url}
		<div class="flex h-full w-full items-center justify-center">
			<img
				src={url}
				alt={name ?? $t('common.image_attachment')}
				class="h-auto max-h-full max-w-full rounded-md"
			/>
		</div>
	{:else if content !== null}
		<pre class="p-0 text-xs leading-relaxed whitespace-pre-wrap" role="document">{content}</pre>
	{:else}
		<div
			class="text-muted-foreground flex h-full items-center justify-center text-sm"
			role="status"
			aria-live="polite"
		>
			{$t('files.preview_not_supported')}
		</div>
	{/if}
</div>
