<script lang="ts">
	import { exportNote, exportNoteHtml } from '@/api/export';
	import { duplicateNote } from '@/api/notes';
	import Icon from '@/components/shared/icon.svelte';
	import { SHORTCUTS } from '@/constants';
	import { isMobile } from '@/platform.svelte';
	import { appState } from '@/store.svelte';
	import type { FileEntry } from '@/types';
	import { fileManagerLabel, showInFolder } from '@/utils/fs';
	import { shortcutToString } from '@/utils/keyboard';
	import * as ContextMenu from '@tactile/ui/components/context-menu';
	import MoveToMenu from './move-to-menu.svelte';

	let {
		entry,
		entries,
		onRename,
		onDelete
	}: {
		entry: FileEntry;
		entries: FileEntry[];
		onRename: () => void;
		onDelete: () => void;
	} = $props();
</script>

<ContextMenu.Content class="w-44">
	<ContextMenu.Item class="flex items-center gap-2 group" onclick={onRename}>
		<Icon name="editPencil" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
		Rename
		<ContextMenu.Shortcut>{shortcutToString(SHORTCUTS['note:rename'])}</ContextMenu.Shortcut>
	</ContextMenu.Item>
	<ContextMenu.Item class="flex items-center gap-2 group" onclick={() => duplicateNote(entry.path)}>
		<Icon name="copy" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
		Duplicate
		<ContextMenu.Shortcut>{shortcutToString(SHORTCUTS['note:duplicate'])}</ContextMenu.Shortcut>
	</ContextMenu.Item>
	<ContextMenu.Separator />
	{#if !isMobile}
		<ContextMenu.Item
			class="flex items-center gap-2 group"
			onclick={() => showInFolder(entry.path)}
		>
			<Icon name="eye" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
			Show in {fileManagerLabel()}
			<ContextMenu.Shortcut
				>{shortcutToString(SHORTCUTS['note:show-in-folder'])}</ContextMenu.Shortcut
			>
		</ContextMenu.Item>
	{/if}
	<MoveToMenu {entry} {entries} type="note" />
	<ContextMenu.Item
		class="flex items-center gap-2 group"
		onclick={() => {
			appState.isNoteDetailSidebarOpen = true;
			appState.noteDetailTab = 'history';
			// The history panel reads the active file, so open the note first.
			if (appState.activeFile !== entry.path) {
				import('@/api/notes').then(({ openNote }) => openNote(entry.path, true));
			}
		}}
	>
		<Icon name="reload" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
		Version history
	</ContextMenu.Item>
	<ContextMenu.Sub>
		<ContextMenu.SubTrigger class="flex items-center gap-2 group">
			<Icon name="share" class="w-3.5 h-3.5 fill-foreground/70" />
			Export
		</ContextMenu.SubTrigger>
		<ContextMenu.SubContent class="w-48">
			<ContextMenu.Item
				class="flex items-center gap-2 group"
				onclick={() => exportNote(entry.path)}
			>
				<Icon name="note" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
				Markdown (.md)
			</ContextMenu.Item>
			<ContextMenu.Item
				class="flex items-center gap-2 group"
				onclick={() => exportNoteHtml(entry.path)}
			>
				<Icon name="note" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
				Printable HTML
			</ContextMenu.Item>
		</ContextMenu.SubContent>
	</ContextMenu.Sub>
	<ContextMenu.Separator />
	<ContextMenu.Item
		class="flex text-destructive data-[highlighted]:bg-destructive/20 data-[highlighted]:text-destructive items-center gap-2 group"
		onclick={onDelete}
	>
		<Icon name="bin" class="w-3.5 h-3.5 fill-destructive/70 group-hover:fill-destructive" />
		Delete
		<ContextMenu.Shortcut class="text-destructive/60"
			>{shortcutToString(SHORTCUTS['note:delete'])}</ContextMenu.Shortcut
		>
	</ContextMenu.Item>
</ContextMenu.Content>
