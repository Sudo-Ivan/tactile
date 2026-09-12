<script lang="ts">
	import { appState } from '@/store.svelte';
	import * as Command from '@tactile/ui/components/command';
	import { onMount } from 'svelte';
	import { mainCommands, createNoteCommands } from './commands';
	import ChangeThemePage from './pages/change-theme.svelte';
	import DefaultPage from './pages/default.svelte';
	import HelpPage from './pages/help.svelte';
	import MoveNotePage from './pages/move-note.svelte';
	import OpenCollectionPage from './pages/open-collection.svelte';
	import OpenNotePage from './pages/open-note.svelte';
	import SharePage from './pages/share.svelte';
	import TrashPage from './pages/trash.svelte';

	let open = $state(false);
	let search = $state('');
	let value = $state('');
	let page = $state<string | undefined>(undefined);
	let openedWithShortcut = $state('');

	const shortcutKeyMap: Record<string, string | undefined> = {
		'cmd+k': 'default',
		'cmd+j': 'open_note',
		'cmd+shift+m': 'move_note',
		'cmd+shift+t': 'change_theme',
		'cmd+o': 'open_collection',
		'cmd+shift+h': 'help_and_feedback',
		'cmd+shift+l': 'share'
	};

	// Note specific commands are prepended to the list while a note is active
	const commandGroups = $derived(
		appState.activeFile ? [createNoteCommands(appState.activeFile), ...mainCommands] : mainCommands
	);

	// If a page is provided, it opens that page, otherwise it closes the menu
	function handlePageState(newPage: string | undefined) {
		if (!newPage) {
			open = false;
			openedWithShortcut = '';
		} else {
			// Add bounce animation for page change
			const dialog = document.querySelector('[data-dialog-content]');

			if (dialog) {
				dialog.animate(
					[
						{ transform: 'scale(1)' },
						{ transform: 'scale(0.98, 0.98)' },
						{ transform: 'scale(1, 1)' }
					],
					{
						duration: 225,
						easing: 'ease'
					}
				);
			}
		}

		page = newPage;
		search = '';
	}

	// Set value to first command when a note becomes active
	$effect(() => {
		if (appState.activeFile) {
			value = commandGroups[0].commands[0].title;
		}
	});

	onMount(() => {
		function handleKeydown(e: KeyboardEvent) {
			const keyPressed = `${e.metaKey || e.ctrlKey ? 'cmd+' : ''}${e.shiftKey ? 'shift+' : ''}${
				e.key
			}`;
			if (
				(e.metaKey || e.ctrlKey || e.shiftKey) &&
				shortcutKeyMap[keyPressed] &&
				(openedWithShortcut === keyPressed || openedWithShortcut === '')
			) {
				e.preventDefault();
				openedWithShortcut = keyPressed;
				page = shortcutKeyMap[keyPressed];
				open = !open;
				if (!open) {
					handlePageState(undefined);
				}
			}
		}
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<Command.Dialog
	bind:open
	bind:value
	loop
	onkeydown={(e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			handlePageState(undefined);
			openedWithShortcut = '';
		} else if (
			e.key === 'Backspace' &&
			!search &&
			page !== 'default' &&
			openedWithShortcut === 'cmd+k'
		) {
			handlePageState('default');
		}
	}}
>
	<Command.Input bind:value={search} placeholder="Search or jump to..." />
	<Command.List>
		<Command.Empty class="text-foreground/60 font-light">No commands found</Command.Empty>
		{#if page === 'default'}
			<DefaultPage groups={commandGroups} onPageChange={handlePageState} />
		{:else if page === 'move_note'}
			<MoveNotePage onPageChange={handlePageState} />
		{:else if page === 'open_note'}
			<OpenNotePage onPageChange={handlePageState} />
		{:else if page === 'change_theme'}
			<ChangeThemePage onPageChange={handlePageState} />
		{:else if page === 'open_collection'}
			<OpenCollectionPage onPageChange={handlePageState} />
		{:else if page === 'help_and_feedback'}
			<HelpPage onPageChange={handlePageState} />
		{:else if page === 'share'}
			<SharePage onPageChange={handlePageState} />
		{:else if page === 'trash'}
			<TrashPage onPageChange={handlePageState} />
		{/if}
	</Command.List>
</Command.Dialog>

<style>
	:global([data-command-list]) {
		height: min(300px, var(--bits-command-list-height));
		max-height: 400px;
		margin-bottom: 8px;
		margin-top: 8px;
		overscroll-behavior: contain;
		transition: 100ms ease;
		transition-property: height;
	}
</style>
