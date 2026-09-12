<script lang="ts">
	import { longpress } from '@/actions/longpress';
	import { createEntryDrag } from '@tactile/core/actions/drag';
	import { createEntryRename } from '@tactile/core/actions/rename.svelte';
	import { exportDirectoryHtml, exportNoteHtml } from '@tactile/core/api/export';
	import { createFolder, deleteFolder } from '@tactile/core/api/folders';
	import { createNote, deleteNote, duplicateNote, openNote } from '@tactile/core/api/notes';
	import FolderContextMenu from '@tactile/core/components/notes/folder-context-menu.svelte';
	import NoteContextMenu from '@tactile/core/components/notes/note-context-menu.svelte';
	import Icon from '@tactile/core/components/shared/icon.svelte';
	import Shortcut from '@tactile/core/components/shared/shortcut.svelte';
	import { SHORTCUTS } from '@/constants';
	import { isMobile } from '@/platform.svelte';
	import { appState } from '@/store.svelte';
	import { dispatchContextMenu } from '@tactile/core/utils/dom';
	import { showInFolder } from '@/utils/fs';
	import type { FileEntry } from '@/types';
	import Button from '@tactile/ui/components/button/button.svelte';
	import * as Collapsible from '@tactile/ui/components/collapsible';
	import * as ContextMenu from '@tactile/ui/components/context-menu';
	import { cn } from '@tactile/ui/lib/utils';
	import Entries from './entries.svelte';

	let {
		entries,
		toggleState = $bindable(),
		// eslint-disable-next-line no-useless-assignment -- bindable prop written for the parent
		toggleFolderStates = $bindable()
	}: {
		entries: FileEntry[];
		toggleState?: 'collapse' | 'expand';
		toggleFolderStates?: () => void;
	} = $props();

	let folderOpenStates = $state<boolean[]>([]);

	const drag = createEntryDrag();
	const renamer = createEntryRename();

	$effect(() => {
		toggleState = folderOpenStates.every((state) => state === false) ? 'expand' : 'collapse';
	});

	// Watch for entries changes and update folderOpenStates array
	// This is necessary as the folderOpenStates array would be empty until collapsible is used to set the initial state
	$effect(() => {
		if (folderOpenStates.length !== entries.length) {
			folderOpenStates = entries.map((_, i) => folderOpenStates[i] ?? false);
		}
	});

	// Root padding is 0.75rem
	// Each level of nesting adds 0.75rem
	// Subtract file path length from collection path length for relative path depth
	function calculateDepth(path: string) {
		return `${(path.split('/').length - (appState.collection ?? '').split('/').length) * 0.75}rem`;
	}

	// Expose the folder toggle handler to the parent through the bindable prop
	// eslint-disable-next-line no-useless-assignment
	toggleFolderStates = () => {
		folderOpenStates = folderOpenStates.map(() => toggleState === 'expand');
	};
</script>

{#if folderOpenStates.length === entries.length}
	{#each entries as entry, i (entry.path)}
		{#if entry.children}
			<Collapsible.Root class="w-full" bind:open={folderOpenStates[i]}>
				<ContextMenu.Root>
					<ContextMenu.Trigger data-path={entry.path}>
						<div
							class="w-full h-full"
							role="button"
							use:longpress
							onlongpress={dispatchContextMenu}
							ondragstart={(e) => drag.handleDragStart(e, entry.name || '')}
							tabindex="0"
							ondragend={(e) => {
								drag.handleDragEnd(e, entry.path, true);
							}}
							data-is-folder
						>
							<Collapsible.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										size="sm"
										variant="ghost"
										scale="sm"
										class={cn(
											'w-full fill-muted-foreground hover:fill-foreground text-secondary-foreground/80 hover:text-foreground transition-all flex items-center justify-between',
											isMobile ? 'h-11' : 'h-7'
										)}
										style={`padding-left: ${calculateDepth(entry.path)}`}
										draggable
									>
										<Shortcut
											options={SHORTCUTS['folder:create']}
											callback={() => {
												if (!renamer.isRenaming) createFolder(entry.path);
											}}
										/>
										<Shortcut
											options={SHORTCUTS['folder:rename']}
											callback={() => !renamer.isRenaming && renamer.rename(entry, 'folder')}
										/>
										<Shortcut
											options={SHORTCUTS['folder:create-note']}
											callback={() => !renamer.isRenaming && createNote(entry.path)}
										/>
										<Shortcut
											options={SHORTCUTS['folder:delete']}
											callback={() => !renamer.isRenaming && deleteFolder(entry.path)}
										/>
										<Shortcut
											options={SHORTCUTS['folder:show-in-folder']}
											callback={() => !renamer.isRenaming && showInFolder(entry.path)}
										/>
										<div class="flex items-center w-[calc(100%-20px)] gap-2">
											<Icon
												name="folder"
												class={cn('w-[18px] h-[18px] shrink-0', folderOpenStates[i] && 'hidden')}
											/>
											<Icon
												name="folderOpen"
												class={cn('w-[18px] h-[18px] shrink-0', !folderOpenStates[i] && 'hidden')}
											/>
											<span
												class={cn('truncate outline-none', isMobile ? 'text-sm' : 'text-xs')}
												spellcheck="false">{entry.name}</span
											>
										</div>
										<!-- TODO: Make this an optional feature -->
										<span class={cn('text-foreground/40', isMobile ? 'text-sm' : 'text-xs')}
											>{entry.children?.length}</span
										>
									</Button>
								{/snippet}
							</Collapsible.Trigger>
						</div>
					</ContextMenu.Trigger>
					<FolderContextMenu
						{entry}
						{entries}
						onRename={() => renamer.rename(entry, 'folder')}
						onCreateNote={() => {
							createNote(entry.path);
							folderOpenStates[i] = true;
						}}
						onCreateFolder={() => {
							createFolder(entry.path);
							folderOpenStates[i] = true;
						}}
						onDelete={() => deleteFolder(entry.path)}
						onPrint={() => exportDirectoryHtml(entry.path)}
						printLabel="Printable HTML"
					/>
				</ContextMenu.Root>
				<Collapsible.Content
					class={cn('space-y-1.5 pt-1.5', entry.children.length === 0 && 'hidden')}
				>
					<Entries entries={entry.children} />
				</Collapsible.Content>
			</Collapsible.Root>
		{:else}
			<ContextMenu.Root>
				<ContextMenu.Trigger class="w-full" data-file-path={entry.path}>
					<div
						class="w-full h-full"
						role="button"
						use:longpress
						onlongpress={dispatchContextMenu}
						ondragstart={(e) => drag.handleDragStart(e, entry.name || '')}
						tabindex="0"
						ondragend={(e) => {
							drag.handleDragEnd(e, entry.path);
						}}
					>
						<Button
							size="sm"
							variant="ghost"
							scale="sm"
							class={cn(
								'w-full transition-all text-secondary-foreground/80 hover:text-foreground flex items-center gap-2 justify-start',
								isMobile ? 'h-11' : 'h-7',
								appState.activeFile === entry.path && 'bg-accent text-foreground'
							)}
							style={`padding-left: ${calculateDepth(entry.path)}`}
							onclick={() => openNote(entry.path)}
							draggable
						>
							<Shortcut
								options={SHORTCUTS['note:rename']}
								callback={() => !renamer.isRenaming && renamer.rename(entry, 'note')}
							/>
							<Shortcut
								options={SHORTCUTS['note:duplicate']}
								callback={() => !renamer.isRenaming && duplicateNote(entry.path)}
							/>
							<Shortcut
								options={SHORTCUTS['note:delete']}
								callback={() => !renamer.isRenaming && deleteNote(entry.path)}
							/>
							<Shortcut
								options={SHORTCUTS['note:show-in-folder']}
								callback={() => !renamer.isRenaming && showInFolder(entry.path)}
							/>
							<span class={cn('truncate', isMobile ? 'text-sm' : 'text-xs')} spellcheck="false"
								>{entry.name}</span
							>
						</Button>
					</div>
				</ContextMenu.Trigger>
				<NoteContextMenu
					{entry}
					{entries}
					onRename={() => renamer.rename(entry, 'note')}
					onDelete={() => deleteNote(entry.path)}
					onPrint={() => exportNoteHtml(entry.path)}
					printLabel="Printable HTML"
				/>
			</ContextMenu.Root>
		{/if}
	{/each}
{/if}

<style>
	:global(.drag-item) {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background-color: hsl(var(--secondary));
		border: 1px solid hsl(var(--border));
		padding-top: 5px;
		padding-bottom: 3px;
		padding-right: 10px;
		padding-left: 20px;
		font-size: 12px;
		width: fit-content;
		height: fit-content;
		border-radius: calc(var(--radius) - 2px);
	}

	:global([data-highlighted]) {
		background-color: hsl(var(--accent));
	}

	:global([data-collapsible-root]) {
		border-radius: calc(var(--radius) - 2px);
	}
</style>
