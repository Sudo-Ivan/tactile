<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '$lib/components/shared/icon.svelte';
	import { type AppRoutePath, ROUTES } from '@/constants';
	import { appState } from '@/store.svelte';
	import { dispatchShortcut } from '@/utils/keyboard';
	import { cn } from '@tactile/ui/lib/utils';
	import SettingsModal from '../settings/settings-modal.svelte';

	const tabs: {
		route: AppRoutePath;
		label: string;
		icon: 'inboxFull' | 'calendarEdit' | 'checkSquare';
	}[] = [
		{ route: ROUTES.notes, label: 'Notes', icon: 'inboxFull' },
		{ route: ROUTES.daily, label: 'Daily', icon: 'calendarEdit' },
		{ route: ROUTES.tasks, label: 'Tasks', icon: 'checkSquare' }
	];

	function navigateTo(path: AppRoutePath) {
		if (!appState.collection) {
			// Simulate cmd+o key press, same as the desktop rail
			dispatchShortcut('o');
		} else {
			goto(resolve(path));
		}
	}
</script>

<nav
	class="fixed bottom-0 left-0 z-40 flex w-full items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)]"
>
	{#each tabs as tab (tab.route)}
		<button
			class={cn(
				'flex h-14 flex-1 flex-col items-center justify-center gap-1 fill-muted-foreground text-muted-foreground transition-all',
				page.url.pathname === tab.route && 'fill-foreground text-foreground bg-accent'
			)}
			onclick={() => navigateTo(tab.route)}
		>
			<Icon name={tab.icon} class="w-5 h-5" />
			<span class="text-[11px] leading-none">{tab.label}</span>
		</button>
	{/each}
	<button
		class="flex h-14 flex-1 flex-col items-center justify-center gap-1 fill-muted-foreground text-muted-foreground transition-all"
		onclick={() => {
			appState.settingsStore = { isOpen: true, activePage: 'general' };
		}}
	>
		<Icon name="settings" class="w-5 h-5" />
		<span class="text-[11px] leading-none">Settings</span>
	</button>
</nav>

<!-- Renders the settings dialog. Its trigger stays hidden, opening is driven
	by appState.settingsStore.isOpen instead. -->
<div class="hidden">
	<SettingsModal />
</div>
