<script lang="ts">
	import { sidebarResize } from '@tactile/core/actions/sidebar-resize';
	import { fetchCollectionEntries } from '@tactile/core/api/collection';
	import { createFolder } from '@tactile/core/api/folders';
	import { closeNote, createNote, openNote } from '@tactile/core/api/notes';
	import Icon from '@tactile/core/components/shared/icon.svelte';
	import Shortcut from '@tactile/core/components/shared/shortcut.svelte';
	import Tooltip from '@tactile/core/components/shared/tooltip.svelte';
	import { SHORTCUTS } from '@/constants';
	import SearchResults from '@tactile/core/components/notes/search-results.svelte';
	import SidebarSearch, {
		type CollectionSearch
	} from '@tactile/core/components/notes/sidebar-search.svelte';
	import { subscribeCollectionChanges } from '@/storage';
	import { appState } from '@/store.svelte';
	import { searchEntries } from '@/utils';
	import { Button } from '@tactile/ui/components/button';
	import Label from '@tactile/ui/components/label/label.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import { onDestroy, untrack } from 'svelte';
	import Entries from './entries.svelte';

	let search = $state<CollectionSearch>({
		value: '',
		loading: false,
		caseSensitive: false,
		wholeWord: false,
		results: []
	});
	let folderOpenStates = $state<boolean[]>([]);
	let folderToggleState = $derived(
		folderOpenStates.every((state) => !state) ? 'expand' : 'collapse'
	);
	let stopWatching: (() => void) | undefined;

	// Expand or collapse all folders
	const toggleFolderStates = () => {
		folderOpenStates = folderOpenStates.map(() => folderToggleState === 'expand');
	};

	// Watch for changes in the collection
	async function watchCollection() {
		return subscribeCollectionChanges(appState.collection!, () => {
			fetchCollectionEntries(appState.collection);
		});
	}

	$effect(() => {
		const value = appState.collection;
		if (!value) return;

		untrack(async () => {
			const entries = await fetchCollectionEntries(value);

			// Find first item that is a note (entry.children === undefined)
			const firstNote = entries.find((entry) => !entry.children);

			// Open the first note
			if (firstNote) {
				openNote(firstNote.path);
			} else {
				closeNote();
			}

			if (stopWatching) stopWatching();
			stopWatching = await watchCollection();
		});
	});

	onDestroy(() => {
		if (stopWatching) stopWatching();
	});
</script>

<div
	class={cn(
		'fixed left-12 h-[calc(100vh-4.5rem)] flex flex-col justify-start items-center bg-background overflow-y-auto transform transition-transform duration-300',
		!appState.isPageSidebarOpen && '-translate-x-52'
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
					aria-label="New note"
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
					aria-label="New folder"
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
					onclick={toggleFolderStates}
					aria-label="Toggle folders"
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
					aria-label="Search collection"
				>
					<Shortcut options={SHORTCUTS['notes:search']} />
					<Icon name="searchBars" class="w-[18px] h-[18px]" />
				</Button>
			</Tooltip>
		</div>
		<!-- Search -->
		<SidebarSearch
			bind:search
			onSearch={(query, options) =>
				searchEntries(appState.collection!, query, {
					caseSensitive: options.caseSensitive,
					mode: options.wholeWord ? 'word' : 'fuzzy'
				})}
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
			<SearchResults results={search.results} query={search.value} loading={search.loading} />
		{:else}
			{#if appState.collectionEntries.length === 0}
				<div class="w-full h-full flex flex-col gap-2 items-center justify-center">
					<Label class="text-muted-foreground text-xs text-center">
						{appState.collection ? 'No notes found' : 'No collection open'}
					</Label>
					{#if appState.collection}
						<button
							class="text-muted-foreground hover:text-foreground text-xs transition-colors"
							onclick={() => createNote(appState.collection!)}
						>
							Create your first note
						</button>
					{/if}
				</div>
			{/if}
			<Entries entries={appState.collectionEntries} bind:folderOpenStates />
		{/if}
	</div>
</div>

<style>
	:global(body.cursor-col-resize) {
		pointer-events: none;
	}
</style>
