<script lang="ts">
	import { sidebarResize } from '@/actions/sidebar-resize';
	import { fetchCollectionEntries } from '@/api/collection';
	import { createFolder } from '@/api/folders';
	import { createNote, openNote } from '@/api/notes';
	import Icon from '@/components/shared/icon.svelte';
	import Shortcut from '@/components/shared/shortcut.svelte';
	import Tooltip from '@/components/shared/tooltip.svelte';
	import { SHORTCUTS } from '@/constants';
	import { appState } from '@/store.svelte';
	import type { FileEntry } from '@/types';
	import { Button } from '@tactile/ui/components/button';
	import Label from '@tactile/ui/components/label/label.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import type { UnlistenFn } from '@tauri-apps/api/event';
	import { watchImmediate } from '@tauri-apps/plugin-fs';
	import Entries from './entries.svelte';
	import SearchPanel from './search-panel.svelte';
	import SearchResults from './search-results.svelte';

	let searchResults = $state<{ path: string; context_preview: string }[]>([]);
	let searchLoading = $state(false);
	let searchQuery = $state('');
	let searchOptions = $state({ caseSensitive: false, wholeWord: false });
	let entries = $state<FileEntry[]>([]);
	let folderToggleState = $state<'collapse' | 'expand'>();
	let toggleFolderStates = $state<() => void>(() => {});
	let stopWatching: UnlistenFn | undefined;

	// Watch for changes in the collection
	async function watchCollection(collectionPath: string) {
		const unlisten = await watchImmediate(
			collectionPath,
			async () => {
				entries = await fetchCollectionEntries(collectionPath);
			},
			{ recursive: true }
		);

		return unlisten;
	}

	async function onCollectionChange(collectionPath: string | undefined) {
		entries = await fetchCollectionEntries(collectionPath);

		// Find first item that is a note (entry.children === undefined)
		const firstNote = entries.find((entry) => !entry.children);

		// Open the first note
		if (firstNote) {
			openNote(firstNote.path);
		} else {
			appState.activeFile = null;
		}

		if (collectionPath) {
			if (stopWatching) stopWatching();
			stopWatching = await watchCollection(collectionPath);
		}
	}

	$effect(() => {
		const collectionPath = appState.collection;
		void onCollectionChange(collectionPath);

		return () => {
			stopWatching?.();
			stopWatching = undefined;
		};
	});
</script>

<div
	class={cn(
		'fixed left-12 flex flex-col justify-start items-center bg-background overflow-y-auto transform transition-transform duration-300',
		!appState.isPageSidebarOpen && '-translate-x-52',
		appState.platform === 'darwin' ? 'h-[calc(100vh-4.5rem)]' : 'h-[calc(100vh-2.25rem)]'
	)}
	style={`width: ${appState.pageSidebarWidth}px`}
>
	<!-- Drag border -->
	<div
		class="h-full w-1 border-r cursor-col-resize absolute top-0 right-0 z-10 hover:bg-foreground/10 hover:delay-75 transition-all duration-200 active:bg-foreground/20 active:!cursor-col-resize"
		use:sidebarResize={'page'}
		role="presentation"
	></div>

	<!-- Controls -->
	<div class="relative top-0 flex flex-col min-h-10 w-full border-b bg-background overflow-hidden">
		<!-- Main Actions -->
		<div
			class={cn(
				'flex flex-row items-center justify-center w-full h-full px-3.5 gap-2 shrink-0 transform transition-all translate-y-0',
				appState.collectionSearchActive && '-translate-y-12'
			)}
		>
			<Tooltip text="New note" side="bottom" shortcut={SHORTCUTS['notes:create']}>
				<Button
					size="icon"
					variant="ghost"
					scale="md"
					class="h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all"
					onclick={async () => createNote(appState.collection!)}
				>
					<Shortcut options={SHORTCUTS['notes:create']} />
					<Icon name="notePlus" class="w-[18px] h-[18px]" />
				</Button>
			</Tooltip>
			<Tooltip text="New folder" side="bottom" shortcut={SHORTCUTS['notes:create-folder']}>
				<Button
					size="icon"
					variant="ghost"
					scale="md"
					class="h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all"
					onclick={async () => createFolder(appState.collection!)}
				>
					<Shortcut options={SHORTCUTS['notes:create-folder']} />
					<Icon name="folderPlus" class="w-[18px] h-[18px]" />
				</Button>
			</Tooltip>
			<Tooltip
				text={folderToggleState === 'collapse' ? 'Collapse folders' : 'Expand folders'}
				side="bottom"
			>
				<Button
					size="icon"
					variant="ghost"
					scale="md"
					class="h-7 w-7 fill-muted-foreground hover:fill-foreground"
					onclick={async () => {
						toggleFolderStates();
					}}
				>
					<Icon
						name="collapseCircle"
						class={cn(
							'w-[18px] h-[18px] transition-all transform',
							folderToggleState === 'collapse' && 'hidden'
						)}
					/>
					<Icon
						name="expandCircle"
						class={cn(
							'w-[18px] h-[18px] transition-all transform',
							folderToggleState === 'expand' && 'hidden'
						)}
					/>
				</Button>
			</Tooltip>
			<Tooltip text="Search" side="bottom" shortcut={SHORTCUTS['notes:search']}>
				<Button
					size="icon"
					variant="ghost"
					scale="md"
					class="h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all"
					onclick={() => {
						appState.collectionSearchActive = !appState.collectionSearchActive;
					}}
				>
					<Shortcut options={SHORTCUTS['notes:search']} />
					<Icon name="searchBars" class="w-[18px] h-[18px]" />
				</Button>
			</Tooltip>
		</div>
		<!-- Search -->
		<SearchPanel
			bind:results={searchResults}
			bind:loading={searchLoading}
			bind:query={searchQuery}
			bind:options={searchOptions}
		/>
	</div>

	<!-- Folders -->
	<!-- Set y paddings here instead of in the parent as gap so scrollbar is not affected -->
	<div
		class="flex flex-col items-start gap-1 w-full px-2 h-full overflow-auto pt-2 pb-4"
		data-collection-root
		data-path={appState.collection}
	>
		{#if appState.collectionSearchActive}
			<SearchResults
				results={searchResults}
				query={searchQuery}
				searchSettings={searchOptions}
				loading={searchLoading}
			/>
		{:else}
			{#if entries.length === 0}
				<div class="w-full h-full flex flex-col gap-1 items-center justify-center">
					<Label class="text-muted-foreground text-xs text-center">No notes found</Label>
				</div>
			{/if}
			<Entries {entries} bind:toggleFolderStates bind:toggleState={folderToggleState} />
		{/if}
	</div>
</div>
