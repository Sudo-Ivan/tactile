<script lang="ts">
	import { createFolder, moveFolder } from '@/api/folders';
	import { moveNote } from '@/api/notes';
	import Icon from '@/components/shared/icon.svelte';
	import { SHORTCUTS, UNTITLED_NAME } from '@/constants';
	import type { FileEntry } from '@/types';
	import { shortcutToString } from '@/utils/keyboard';
	import * as ContextMenu from '@tactile/ui/components/context-menu';

	let {
		entry,
		entries,
		type
	}: {
		entry: FileEntry;
		entries: FileEntry[];
		type: 'note' | 'folder';
	} = $props();

	// Directories the entry can be moved into, excluding the entry itself
	const directories = $derived(entries.filter((item) => item.children));
	const targets = $derived(directories.filter((directory) => directory.name !== entry.name));

	function moveTo(target: string) {
		if (type === 'folder') {
			moveFolder(entry.path, target);
		} else {
			moveNote(entry.path, target);
		}
	}

	async function moveToNewFolder() {
		const parentPath = entry.path.split('/').slice(0, -1).join('/');

		// Create a new folder in parent directory
		const dirPath = await createFolder(parentPath);

		// Move the entry to the new folder
		if (type === 'folder') {
			moveFolder(entry.path, dirPath);
		} else {
			moveNote(entry.path, `${parentPath}/${UNTITLED_NAME}`);
		}
	}
</script>

<ContextMenu.Sub>
	<ContextMenu.SubTrigger class="flex items-center gap-2 font-base group">
		<Icon name="motionCirclesLines" class="w-3.5 h-3.5 fill-foreground/70" />
		Move {type} to...
	</ContextMenu.SubTrigger>
	<ContextMenu.SubContent class="w-40">
		{#each targets as directory (directory.path)}
			<ContextMenu.Item
				class="flex items-center gap-2 font-base group"
				onclick={() => moveTo(directory.path)}
			>
				<Icon name="folder" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
				{directory.name}
			</ContextMenu.Item>
		{/each}

		{#if targets.length === 0}
			<ContextMenu.Item class="flex items-center gap-2 font-base group" onclick={moveToNewFolder}>
				<Icon
					name="folderPlus"
					class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground"
				/>
				New folder
				<ContextMenu.Shortcut>{shortcutToString(SHORTCUTS['folder:create'])}</ContextMenu.Shortcut>
			</ContextMenu.Item>
		{/if}
	</ContextMenu.SubContent>
</ContextMenu.Sub>
