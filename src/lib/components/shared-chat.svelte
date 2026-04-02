<script lang="ts">
	import type { UIMessageWithTree } from '$lib/types/message';
	import Messages from '$lib/components/messages.svelte';
	import { untrack } from 'svelte';
	import {
		computeDefaultSelectedMessageIds,
		computeMessagesWithSiblingsFromIndex,
		createMessageTreeIndex,
		getMessagePathFromIndex
	} from '$lib/utils/chat';

	let {
		initialMessages
	}: {
		initialMessages: UIMessageWithTree[];
	} = $props();

	let selectedMessageIds = $state<Record<string, string>>(
		computeDefaultSelectedMessageIds(untrack(() => initialMessages))
	);
	const messageTreeIndex = $derived(createMessageTreeIndex(initialMessages));
	const visibleMessages = $derived(getMessagePathFromIndex(messageTreeIndex, selectedMessageIds));
	const messagesWithSiblings = $derived(
		computeMessagesWithSiblingsFromIndex(messageTreeIndex, visibleMessages)
	);

	function handleSwitchBranch(parentId: string, messageId: string) {
		selectedMessageIds = {
			...selectedMessageIds,
			[parentId || 'root']: messageId
		};
	}
</script>

<div class="chat-root relative flex h-full flex-col overflow-hidden">
	<Messages
		readonly={true}
		loading={false}
		messages={visibleMessages}
		{messagesWithSiblings}
		allMessages={initialMessages}
		onswitchbranch={handleSwitchBranch}
	/>
</div>
