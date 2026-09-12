<script lang="ts">
	import { exportFolder } from '../../api/export';
	import { SHORTCUTS } from '../../constants';
	import { isMobile, platformHooks } from '../../platform';
	import type { FileEntry } from '../../types';
	import { shortcutToString } from '../../utils/keyboard';
	import * as ContextMenu from '@tactile/ui/components/context-menu';
	import Icon from '../shared/icon.svelte';
	import MoveToMenu from './move-to-menu.svelte';

	// Actions come in as callbacks so each app can also expand the folder,
	// and the "printable" export differs per platform: web prints through the
	// browser (PDF / Print), desktop saves a printable HTML file.
	let {
		entry,
		entries,
		onRename,
		onCreateNote,
		onCreateFolder,
		onDelete,
		onPrint,
		printLabel
	}: {
		entry: FileEntry;
		entries: FileEntry[];
		onRename: () => void;
		onCreateNote: () => void;
		onCreateFolder: () => void;
		onDelete: () => void;
		onPrint: () => void;
		printLabel: string;
	} = $props();

	// Reveal-in-file-manager only exists where the OS file manager is
	// reachable (desktop); web never registers the hook.
	const showInFolder = platformHooks()?.showInFolder;
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
	{#if !isMobile() && showInFolder}
		<ContextMenu.Separator />
		<ContextMenu.Item
			class="flex items-center gap-2 group"
			onclick={() => showInFolder(entry.path)}
		>
			<Icon name="eye" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
			Show in {platformHooks()?.fileManagerLabel?.() ?? 'file manager'}
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
		<ContextMenu.SubContent class="w-44">
			<ContextMenu.Item
				class="flex items-center gap-2 group"
				onclick={() => exportFolder(entry.path)}
			>
				<Icon name="folder" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
				Folder (.zip)
			</ContextMenu.Item>
			<ContextMenu.Item class="flex items-center gap-2 group" onclick={onPrint}>
				<Icon name="note" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
				{printLabel}
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
