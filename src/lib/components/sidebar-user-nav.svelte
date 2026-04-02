<script lang="ts">
	import type { User } from '$lib/types/db';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '$lib/components/ui/sidebar';
	import Settings from '$lib/components/settings/settings.svelte';
	import ProfileModal from '$lib/components/profile-modal.svelte';
	import KeyboardShortcuts from '$lib/components/keyboard-shortcuts.svelte';
	import { SettingsState } from '$lib/hooks/settings-state.svelte';
	import { useSidebar } from '$lib/components/ui/sidebar';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import KeyboardIcon from '@lucide/svelte/icons/keyboard';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MoreHorizontalIcon from '@lucide/svelte/icons/more-horizontal';
	import { t } from 'svelte-i18n';
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

	let { user }: { user: User } = $props();
	const settingsState = SettingsState.fromContext();
	const sidebar = useSidebar();
	let showSignoutDialog = $state(false);
	let profileOpen = $state(false);
	let userOverride = $state<User | null>(null);
	let avatarLoadFailed = $state(false);
	const currentUser = $derived(userOverride ?? user);

	function handleProfileUpdated(updated: User) {
		userOverride = updated;
	}

	const displayName = $derived(currentUser?.displayName ?? currentUser?.email ?? user?.email ?? '');
	const avatarSrc = $derived(currentUser?.avatarUrl ?? null);
	const avatarInitial = $derived(Array.from(displayName.trim())[0]?.toUpperCase() ?? 'U');
	const handle = $derived(
		currentUser?.email
			? `@${currentUser.email.split('@')[0]}`
			: user?.email
				? `@${user.email.split('@')[0]}`
				: ''
	);

	$effect(() => {
		if (avatarSrc === undefined) return;
		avatarLoadFailed = false;
	});
</script>

<SidebarMenu>
	<SidebarMenuItem>
		<DropdownMenu>
			<DropdownMenuTrigger>
				{#snippet child({ props })}
					<SidebarMenuButton {...props} class="h-11 items-center">
						{#if avatarSrc && !avatarLoadFailed}
							<img
								src={avatarSrc}
								alt={displayName ?? $t('common.user_avatar')}
								width={28}
								height={28}
								class="aspect-square rounded-full object-cover"
								onerror={() => {
									avatarLoadFailed = true;
								}}
							/>
						{:else}
							<div
								class="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
								aria-label={displayName ?? $t('common.user_avatar')}
							>
								{avatarInitial}
							</div>
						{/if}
						<span class="self-center truncate font-medium">{displayName}</span>
						<MoreHorizontalIcon size={16} class="ms-auto shrink-0 self-center" />
					</SidebarMenuButton>
				{/snippet}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side="top"
				align="start"
				sideOffset={4}
				class="w-[--bits-floating-anchor-width] min-w-60"
			>
				<DropdownMenuItem
					class="flex cursor-pointer items-center gap-2 px-2 py-2"
					onSelect={() => (profileOpen = true)}
				>
					{#if avatarSrc && !avatarLoadFailed}
						<img
							src={avatarSrc}
							alt={displayName}
							class="size-8 shrink-0 rounded-full object-cover"
							onerror={() => {
								avatarLoadFailed = true;
							}}
						/>
					{:else}
						<div
							class="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
							aria-label={displayName}
						>
							{avatarInitial}
						</div>
					{/if}
					<div class="flex min-w-0 flex-col justify-center">
						<span class="truncate text-sm leading-tight font-medium">{displayName}</span>
						<span class="text-muted-foreground truncate text-xs">{handle}</span>
					</div>
				</DropdownMenuItem>
				<div class="px-2">
					<DropdownMenuSeparator class="mx-0" />
				</div>
				<DropdownMenuItem class="cursor-pointer" onSelect={() => (settingsState.open = true)}>
					<SettingsIcon class="size-4" />
					<span>{$t('common.settings')}</span>
				</DropdownMenuItem>
				{#if !sidebar.isMobile}
					<DropdownMenuItem
						class="cursor-pointer"
						onSelect={() => (settingsState.shortcutsOpen = true)}
					>
						<KeyboardIcon class="size-4" />
						<span>{$t('common.keyboard_shortcuts')}</span>
					</DropdownMenuItem>
				{/if}
				<DropdownMenuItem
					variant="destructive"
					class="cursor-pointer"
					onSelect={() => (showSignoutDialog = true)}
				>
					<LogOutIcon class="size-4" />
					<span>{$t('common.sign_out')}</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	</SidebarMenuItem>
</SidebarMenu>
<Settings bind:open={settingsState.open} />
<ProfileModal bind:open={profileOpen} user={currentUser ?? user} onupdated={handleProfileUpdated} />
<KeyboardShortcuts bind:open={settingsState.shortcutsOpen} />

<AlertDialog bind:open={showSignoutDialog}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>{$t('auth.sign_out_confirm')}</AlertDialogTitle>
			<AlertDialogDescription>{$t('auth.sign_out_description')}</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>{$t('common.cancel')}</AlertDialogCancel>
			<AlertDialogAction
				variant="destructive"
				onclick={() => {
					window.location.href = '/signout';
				}}>{$t('auth.sign_out_action')}</AlertDialogAction
			>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
