<script lang="ts">
	import { fly } from 'svelte/transition';
	import LoadingDots from '$lib/components/ui/loading-dots.svelte';
	import { t } from 'svelte-i18n';
</script>

<div
	class="group/message w-full"
	data-role="assistant"
	in:fly={{ opacity: 0, duration: 200 }}
	role="status"
	aria-live="polite"
>
	<div class="flex w-full flex-row items-start py-2">
		<div class="flex w-full min-w-0 flex-col gap-2">
			<div class="text-muted-foreground flex h-8 flex-row items-center gap-1">
				<LoadingDots />
				<span class="sr-only">{$t('chat.generating_response')}</span>
			</div>
		</div>
	</div>
</div>
