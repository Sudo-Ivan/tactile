<script lang="ts">
	import { sidebarResize } from '@tactile/core/actions/sidebar-resize';
	import { fetchCollectionEntries } from '@tactile/core/api/collection';
	import { createFolder } from '@tactile/core/api/folders';
	import { closeNote, createNote, openNote } from '@tactile/core/api/notes';
	import Icon from '@tactile/core/components/shared/icon.svelte';
	import Shortcut from '@tactile/core/components/shared/shortcut.svelte';
	import Tooltip from '@tactile/core/components/shared/tooltip.svelte';
	import { SEARCH_FILES_COMMAND, SHORTCUTS } from '@/constants';
	import { isMobile } from '@/platform.svelte';
	import { appState } from '@/store.svelte';
	import type { FileEntry } from '@/types';
	import SearchResults from '@tactile/core/components/notes/search-results.svelte';
	import SidebarSearch, {
		type CollectionSearch
	} from '@tactile/core/components/notes/sidebar-search.svelte';
	import type { SearchResultParams } from '@tactile/core/utils/search';
	import { Button } from '@tactile/ui/components/button';
	import Label from '@tactile/ui/components/label/label.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import { invoke } from '@tauri-apps/api/core';
	import type { UnlistenFn } from '@tauri-apps/api/event';
	import { watchImmediate } from '@tauri-apps/plugin-fs';
	import Entries from './entries.svelte';

	let search = $state<CollectionSearch>({
		value: '',
		loading: false,
		caseSensitive: false,
		wholeWord: false,
		results: []
	});

	// Content search runs in Rust through the search_files tauri command.
	const searchFiles = (query: string, options: { caseSensitive: boolean; wholeWord: boolean }) =>
		invoke(SEARCH_FILES_COMMAND, {
			dirPath: appState.collection,
			query,
			caseSensitive: options.caseSensitive,
			matchWord: options.wholeWord,
			recursive: true
		}) as Promise<SearchResultParams[]>;
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

		// Open the first note. On mobile stay on the file list instead
		if (isMobile) {
			closeNote();
		} else if (firstNote) {
			openNote(firstNote.path);
		} else {
			closeNote();
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
		'fixed flex flex-col justify-start items-center bg-background overflow-y-auto transform transition-transform duration-300',
		isMobile
			? 'left-0 top-0 w-full z-30 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))]'
			: cn(
					'left-12',
					!appState.isPageSidebarOpen && '-translate-x-52',
					appState.platform === 'darwin' ? 'h-[calc(100vh-4.5rem)]' : 'h-[calc(100vh-2.25rem)]'
				)
	)}
	style={isMobile ? undefined : `width: ${appState.pageSidebarWidth}px`}
>
	<!-- Drag border -->
	{#if !isMobile}
		<div
			class="h-full w-1 border-r cursor-col-resize absolute top-0 right-0 z-10 hover:bg-foreground/10 hover:delay-75 transition-all duration-200 active:bg-foreground/20 active:!cursor-col-resize"
			use:sidebarResize={'page'}
			role="presentation"
		></div>
	{/if}

	<!-- Controls -->
	<div
		class={cn(
			'relative top-0 flex flex-col w-full border-b bg-background overflow-hidden',
			isMobile ? 'min-h-12' : 'min-h-10'
		)}
	>
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
					class={cn(
						'fill-muted-foreground hover:fill-foreground transition-all',
						isMobile ? 'h-10 w-10' : 'h-7 w-7'
					)}
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
					class={cn(
						'fill-muted-foreground hover:fill-foreground transition-all',
						isMobile ? 'h-10 w-10' : 'h-7 w-7'
					)}
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
					class={cn(
						'fill-muted-foreground hover:fill-foreground',
						isMobile ? 'h-10 w-10' : 'h-7 w-7'
					)}
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
					class={cn(
						'fill-muted-foreground hover:fill-foreground transition-all',
						isMobile ? 'h-10 w-10' : 'h-7 w-7'
					)}
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
		<SidebarSearch bind:search onSearch={searchFiles} />
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
			{#if entries.length === 0}
				<div class="w-full h-full flex flex-col gap-1 items-center justify-center">
					<Label class="text-muted-foreground text-xs text-center">No notes found</Label>
				</div>
			{/if}
			<Entries {entries} bind:toggleFolderStates bind:toggleState={folderToggleState} />
		{/if}
	</div>
</div>
