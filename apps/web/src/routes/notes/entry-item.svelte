<script lang="ts">
	import { createEntryDrag } from '@tactile/core/actions/drag';
	import { createEntryRename } from '@tactile/core/actions/rename.svelte';
	import { printDirectory, printNote } from '@tactile/core/api/export';
	import { createFolder, deleteFolder } from '@tactile/core/api/folders';
	import { createNote, deleteNote, duplicateNote, openNote } from '@tactile/core/api/notes';
	import FolderContextMenu from '@tactile/core/components/notes/folder-context-menu.svelte';
	import NoteContextMenu from '@tactile/core/components/notes/note-context-menu.svelte';
	import Icon from '@tactile/core/components/shared/icon.svelte';
	import Shortcut from '@tactile/core/components/shared/shortcut.svelte';
	import { SHORTCUTS } from '@/constants';
	import { appState } from '@/store.svelte';
	import type { FileEntry } from '@/types';
	import Button from '@tactile/ui/components/button/button.svelte';
	import * as Collapsible from '@tactile/ui/components/collapsible';
	import * as ContextMenu from '@tactile/ui/components/context-menu';
	import { cn } from '@tactile/ui/lib/utils';
	import type { Snippet } from 'svelte';

	interface Props {
		entry: FileEntry;
		open?: boolean;
		entries: FileEntry[];
		children?: Snippet;
	}

	let { entry, open = $bindable(false), entries, children }: Props = $props();

	const drag = createEntryDrag();
	const renamer = createEntryRename();

	// Root padding is 0.75rem
	// Each level of nesting adds 0.75rem
	// Subtract file path length from collection path length for relative path depth
	let depthPadding = $derived(
		`${(entry.path.split('/').length - (appState.collection ?? '').split('/').length) * 0.75}rem`
	);
</script>

{#if entry.children}
	<Collapsible.Root class="w-full" bind:open>
		<ContextMenu.Root>
			<ContextMenu.Trigger data-path={entry.path}>
				<div
					class="w-full h-full"
					role="button"
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
								class="h-7 w-full fill-muted-foreground hover:fill-foreground text-secondary-foreground/80 hover:text-foreground transition-all flex items-center justify-between"
								style={`padding-left: ${depthPadding}`}
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
								<div class="flex items-center w-[calc(100%-20px)] gap-2">
									<Icon name="folder" class={cn('w-[18px] h-[18px] shrink-0', open && 'hidden')} />
									<Icon
										name="folderOpen"
										class={cn('w-[18px] h-[18px] shrink-0', !open && 'hidden')}
									/>
									<span class="text-xs truncate outline-none" spellcheck="false">{entry.name}</span>
								</div>
								<!-- TODO: Make this an optional feature -->
								<span class="text-xs text-foreground/40">{entry.children?.length}</span>
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
					open = true;
				}}
				onCreateFolder={() => {
					createFolder(entry.path);
					open = true;
				}}
				onDelete={() => deleteFolder(entry.path)}
				onPrint={() => printDirectory(entry.path)}
				printLabel="PDF / Print"
			/>
		</ContextMenu.Root>
		<Collapsible.Content class={cn('space-y-1.5 pt-1.5', entry.children.length === 0 && 'hidden')}>
			{@render children?.()}
		</Collapsible.Content>
	</Collapsible.Root>
{:else}
	<ContextMenu.Root>
		<ContextMenu.Trigger class="w-full" data-file-path={entry.path}>
			<div
				class="w-full h-full"
				role="button"
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
						'h-7 w-full transition-all text-secondary-foreground/80 hover:text-foreground flex items-center gap-2 justify-start',
						appState.activeFile === entry.path && 'bg-accent text-foreground'
					)}
					style={`padding-left: ${depthPadding}`}
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
					<span class="text-xs truncate" spellcheck="false">{entry.name}</span>
				</Button>
			</div>
		</ContextMenu.Trigger>
		<NoteContextMenu
			{entry}
			{entries}
			onRename={() => renamer.rename(entry, 'note')}
			onDelete={() => deleteNote(entry.path)}
			onPrint={() => printNote(entry.path)}
			printLabel="PDF / Print"
			showVersionItems
		/>
	</ContextMenu.Root>
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
