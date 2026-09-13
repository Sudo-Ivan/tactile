<script lang="ts">
	import { createFolder, moveFolder } from '../../api/folders';
	import { moveNote } from '../../api/notes';
	import { SHORTCUTS } from '../../constants';
	import type { FileEntry } from '../../types';
	import { shortcutToString } from '../../utils/keyboard';
	import * as ContextMenu from '@tactile/ui/components/context-menu';
	import Icon from '../shared/icon.svelte';

	let {
		entry,
		entries,
		type
	}: {
		entry: FileEntry;
		entries: FileEntry[];
		type: 'note' | 'folder';
	} = $props();

	const parentPath = $derived(entry.path.split('/').slice(0, -1).join('/'));

	// Directories the entry can be moved into: exclude the entry itself
	// (matched by path, not name) and the folder it already lives in.
	const targets = $derived(
		entries.filter((item) => item.children && item.path !== entry.path && item.path !== parentPath)
	);

	function moveTo(target: string) {
		if (type === 'folder') {
			moveFolder(entry.path, target);
		} else {
			moveNote(entry.path, target);
		}
	}

	async function moveToNewFolder() {
		// Create a new folder next to the entry, then move it in. The returned
		// path matters because Untitled may be numbered (Untitled 1, ...).
		const dirPath = await createFolder(parentPath);

		if (type === 'folder') {
			moveFolder(entry.path, dirPath);
		} else {
			moveNote(entry.path, dirPath);
		}
	}
</script>

<ContextMenu.Sub>
	<ContextMenu.SubTrigger class="flex items-center gap-2 group">
		<Icon name="motionCirclesLines" class="w-3.5 h-3.5 fill-foreground/70" />
		Move {type} to...
	</ContextMenu.SubTrigger>
	<ContextMenu.SubContent class="w-40">
		{#each targets as directory (directory.path)}
			<ContextMenu.Item
				class="flex items-center gap-2 group"
				onclick={() => moveTo(directory.path)}
			>
				<Icon name="folder" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
				{directory.name}
			</ContextMenu.Item>
		{/each}

		{#if targets.length > 0}
			<ContextMenu.Separator />
		{/if}
		<ContextMenu.Item class="flex items-center gap-2 group" onclick={moveToNewFolder}>
			<Icon name="folderPlus" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
			New folder
			<ContextMenu.Shortcut>{shortcutToString(SHORTCUTS['folder:create'])}</ContextMenu.Shortcut>
		</ContextMenu.Item>
	</ContextMenu.SubContent>
</ContextMenu.Sub>
