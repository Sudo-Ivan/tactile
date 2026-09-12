<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '../shared/icon.svelte';
	import Tooltip from '../shared/tooltip.svelte';
	import { type AppRoutePath, ROUTES, SHORTCUTS } from '../../constants';
	import { hasHeader } from '../../platform';
	import { appState } from '../../state/app.svelte';
	import { dispatchShortcut } from '../../utils/keyboard';
	import { Button } from '@tactile/ui/components/button';
	import { cn } from '@tactile/ui/lib/utils';
	import SettingsModal from '../settings/settings-modal.svelte';

	let selected = $state<'notes' | 'daily' | 'tasks' | null>(null);

	function navigateTo(path: AppRoutePath) {
		if (!appState.collection) {
			dispatchShortcut('o');
		} else {
			goto(resolve(path));
			selected = path.slice(1) as 'notes' | 'daily' | 'tasks';
		}
	}

	// Sync the selected tab with the current route
	$effect(() => {
		const path = page.url.pathname;
		if (path === ROUTES.notes || path === ROUTES.daily || path === ROUTES.tasks) {
			selected = path.slice(1) as 'notes' | 'daily' | 'tasks';
		}
	});
</script>

<div
	class={cn(
		'fixed left-0 h-full flex flex-col justify-between items-center w-12 py-12 border-r z-10 bg-background',
		!hasHeader() && 'pt-3'
	)}
>
	<div class="flex flex-col items-center gap-2">
		<Tooltip text="Notes" side="right">
			<Button
				size="icon"
				variant="ghost"
				class={cn(
					'h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all',
					selected === 'notes' && 'fill-foreground bg-accent'
				)}
				scale="md"
				onclick={() => navigateTo(ROUTES.notes)}
			>
				<Icon name="inboxFull" class="w-[18px] h-[18px]" />
			</Button>
		</Tooltip>
		<Tooltip text="Daily desk" side="right">
			<Button
				size="icon"
				variant="ghost"
				class={cn(
					'h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all',
					selected === 'daily' && 'fill-foreground bg-accent'
				)}
				scale="md"
				onclick={() => navigateTo(ROUTES.daily)}
			>
				<Icon name="calendarEdit" class="w-[18px] h-[18px]" />
			</Button>
		</Tooltip>
		<Tooltip text="Tasks" side="right">
			<Button
				size="icon"
				variant="ghost"
				class={cn(
					'h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all',
					selected === 'tasks' && 'fill-foreground bg-accent'
				)}
				scale="md"
				onclick={() => navigateTo(ROUTES.tasks)}
			>
				<Icon name="checkSquare" class="w-[18px] h-[18px]" />
			</Button>
		</Tooltip>
	</div>

	<div class="flex flex-col items-center gap-2">
		<Tooltip text="Open collection" side="right" shortcut={SHORTCUTS['app:open-collection']}>
			<Button
				size="icon"
				variant="ghost"
				class="h-7 w-7 fill-muted-foreground hover:fill-foreground group relative"
				scale="md"
				onclick={() => {
					// Simulate cmd+o key press
					dispatchShortcut('o');
				}}
			>
				<Icon name="folder" class="w-[18px] h-[18px] group-hover:hidden" />
				<Icon name="folderOpen" class="w-[18px] h-[18px] hidden group-hover:block" />
			</Button>
		</Tooltip>
		<Tooltip text="Settings" side="right" shortcut={SHORTCUTS['app:settings']}>
			<SettingsModal />
		</Tooltip>
	</div>
</div>
