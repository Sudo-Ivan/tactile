<script lang="ts">
	import { exportDirectoryHtml, exportFolder } from '@/api/export';
	import Icon from '@/components/shared/icon.svelte';
	import { SHORTCUTS } from '@/constants';
	import { isMobile } from '@/platform.svelte';
	import type { FileEntry } from '@/types';
	import { fileManagerLabel, showInFolder } from '@/utils/fs';
	import { shortcutToString } from '@/utils/keyboard';
	import * as ContextMenu from '@tactile/ui/components/context-menu';
	import MoveToMenu from './move-to-menu.svelte';

	let {
		entry,
		entries,
		onRename,
		onCreateNote,
		onCreateFolder,
		onDelete
	}: {
		entry: FileEntry;
		entries: FileEntry[];
		onRename: () => void;
		onCreateNote: () => void;
		onCreateFolder: () => void;
		onDelete: () => void;
	} = $props();
</script>

<ContextMenu.Content class="w-44">
	<ContextMenu.Item class="flex items-center gap-2 group" onclick={onCreateNote}>
		<Icon name="notePlus" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
		New note
		<ContextMenu.Shortcut>{shortcutToString(SHORTCUTS['folder:create-note'])}</ContextMenu.Shortcut>
	</ContextMenu.Item>
	<ContextMenu.Item class="flex items-center gap-2 group" onclick={onCreateFolder}>
		<Icon name="folderPlus" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
		New folder
		<ContextMenu.Shortcut>{shortcutToString(SHORTCUTS['folder:create'])}</ContextMenu.Shortcut>
	</ContextMenu.Item>
	<ContextMenu.Separator />
	<ContextMenu.Item class="flex items-center gap-2 group" onclick={onRename}>
		<Icon name="editPencil" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
		Rename
		<ContextMenu.Shortcut>{shortcutToString(SHORTCUTS['note:rename'])}</ContextMenu.Shortcut>
	</ContextMenu.Item>
	<MoveToMenu {entry} {entries} type="folder" />
	{#if !isMobile}
		<ContextMenu.Separator />
		<ContextMenu.Item
			class="flex items-center gap-2 group"
			onclick={() => showInFolder(entry.path)}
		>
			<Icon name="eye" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
			Show in {fileManagerLabel()}
			<ContextMenu.Shortcut
				>{shortcutToString(SHORTCUTS['folder:show-in-folder'])}</ContextMenu.Shortcut
			>
		</ContextMenu.Item>
	{/if}
	<ContextMenu.Sub>
		<ContextMenu.SubTrigger class="flex items-center gap-2 group">
			<Icon name="share" class="w-3.5 h-3.5 fill-foreground/70" />
			Export
		</ContextMenu.SubTrigger>
		<ContextMenu.SubContent class="w-48">
			<ContextMenu.Item
				class="flex items-center gap-2 group"
				onclick={() => exportFolder(entry.path)}
			>
				<Icon name="folder" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
				Folder (.zip)
			</ContextMenu.Item>
			<ContextMenu.Item
				class="flex items-center gap-2 group"
				onclick={() => exportDirectoryHtml(entry.path)}
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
			>{shortcutToString(SHORTCUTS['folder:delete'])}</ContextMenu.Shortcut
		>
	</ContextMenu.Item>
</ContextMenu.Content>
