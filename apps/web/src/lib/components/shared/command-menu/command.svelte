<script lang="ts">
	import { appState } from '@/store.svelte';
	import * as Command from '@tactile/ui/components/command';
	import { onMount, untrack } from 'svelte';
	import ChangeTheme from './change-theme.svelte';
	import CommandGroups from './command-groups.svelte';
	import { mainCommands as commands, createNoteCommands } from './commands';
	import Help from './help.svelte';
	import MoveNote from './move-note.svelte';
	import OpenCollection from './open-collection.svelte';
	import OpenNote from './open-note.svelte';
	import Share from './share.svelte';
	import Trash from './trash.svelte';

	let open = $state(false);
	let search = $state('');
	let value = $state('');
	let page = $state<string | undefined>(undefined);
	let openedWithShortcut = $state('');
	let loadingCollection = $state<{ loading: boolean; progress: number } | undefined>(undefined);

	// Rendered groups mirror commands, which is mutated with the active note commands
	let groups = $state([...commands]);

	const shortcutKeyMap: Record<string, string | undefined> = {
		'cmd+k': 'default',
		'cmd+j': 'open_note',
		'cmd+shift+m': 'move_note',
		'cmd+shift+t': 'change_theme',
		'cmd+o': 'open_collection',
		'cmd+shift+h': 'help_and_feedback',
		'cmd+shift+l': 'share'
	};

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

	$effect(() => {
		const notePath = appState.activeFile;

		untrack(() => {
			// Remove last note specific commands
			if (commands[0].name !== 'Notes') {
				commands.shift();
			}

			if (notePath) {
				// Add notePath specific commands to the top of the list
				commands.unshift(createNoteCommands(notePath));

				// Set value to first command
				value = commands[0].commands[0].title;
			}

			groups = [...commands];
		});
	});
</script>

<Command.Dialog
	bind:open
	bind:value
	loop
	onkeydown={(e) => {
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
		{#if !loadingCollection}
			<Command.Empty class="text-foreground/60 font-light">No commands found</Command.Empty>
		{/if}
		{#if page === 'default'}
			<CommandGroups {groups} onPageChange={handlePageState} />
		{:else if page === 'move_note'}
			<MoveNote onPageChange={handlePageState} />
		{:else if page === 'open_note'}
			<OpenNote onPageChange={handlePageState} />
		{:else if page === 'change_theme'}
			<ChangeTheme onPageChange={handlePageState} />
		{:else if page === 'open_collection'}
			<OpenCollection bind:loading={loadingCollection} onPageChange={handlePageState} />
		{:else if page === 'help_and_feedback'}
			<Help onPageChange={handlePageState} />
		{:else if page === 'share'}
			<Share onPageChange={handlePageState} />
		{:else if page === 'trash'}
			<Trash onPageChange={handlePageState} />
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
