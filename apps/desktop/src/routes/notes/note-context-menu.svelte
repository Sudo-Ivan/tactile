<script lang="ts">
	import { duplicateNote } from '@/api/notes';
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
		onDelete
	}: {
		entry: FileEntry;
		entries: FileEntry[];
		onRename: () => void;
		onDelete: () => void;
	} = $props();
</script>

<ContextMenu.Content class="w-44">
	<ContextMenu.Item class="flex items-center gap-2 font-base group" onclick={onRename}>
		<Icon name="editPencil" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
		Rename
		<ContextMenu.Shortcut>{shortcutToString(SHORTCUTS['note:rename'])}</ContextMenu.Shortcut>
	</ContextMenu.Item>
	<ContextMenu.Item
		class="flex items-center gap-2 font-base group"
		onclick={() => duplicateNote(entry.path)}
	>
		<Icon name="copy" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
		Duplicate
		<ContextMenu.Shortcut>{shortcutToString(SHORTCUTS['note:duplicate'])}</ContextMenu.Shortcut>
	</ContextMenu.Item>
	<ContextMenu.Separator />
	{#if !isMobile}
		<ContextMenu.Item
			class="flex items-center gap-2 font-base group"
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
	<ContextMenu.Separator />
	<ContextMenu.Item
		class="flex text-destructive data-[highlighted]:bg-destructive/20 data-[highlighted]:text-destructive items-center gap-2 font-base group"
		onclick={onDelete}
	>
		<Icon name="bin" class="w-3.5 h-3.5 fill-destructive/70 group-hover:fill-destructive" />
		Delete
		<ContextMenu.Shortcut class="text-destructive/60"
			>{shortcutToString(SHORTCUTS['note:delete'])}</ContextMenu.Shortcut
		>
	</ContextMenu.Item>
</ContextMenu.Content>
