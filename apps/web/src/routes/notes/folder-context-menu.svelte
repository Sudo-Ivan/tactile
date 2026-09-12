<script lang="ts">
	import { exportFolder, printDirectory } from '@/api/export';
	import { createFolder, deleteFolder, moveFolder } from '@/api/folders';
	import { createNote } from '@/api/notes';
	import Icon from '@/components/shared/icon.svelte';
	import { SHORTCUTS } from '@/constants';
	import type { FileEntry } from '@/types';
	import { shortcutToString } from '@/utils';
	import * as ContextMenu from '@tactile/ui/components/context-menu';

	interface Props {
		entry: FileEntry;
		directories: FileEntry[];
		onExpand: () => void;
		onRename: () => void;
	}

	let { entry, directories, onExpand, onRename }: Props = $props();
</script>

<ContextMenu.Content class="w-44">
	<ContextMenu.Item
		class="flex items-center gap-2 group"
		onclick={() => {
			createNote(entry.path);
			onExpand();
		}}
	>
		<Icon name="notePlus" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
		New note
		<ContextMenu.Shortcut>{shortcutToString(SHORTCUTS['folder:create-note'])}</ContextMenu.Shortcut>
	</ContextMenu.Item>
	<ContextMenu.Item
		class="flex items-center gap-2 group"
		onclick={() => {
			createFolder(entry.path);
			onExpand();
		}}
	>
		<Icon name="folderPlus" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
		New folder
		<ContextMenu.Shortcut>{shortcutToString(SHORTCUTS['folder:create'])}</ContextMenu.Shortcut>
	</ContextMenu.Item>
	<ContextMenu.Separator />
	<ContextMenu.Item
		class="flex items-center gap-2 group"
		onclick={async () => {
			onRename();
		}}
	>
		<Icon name="editPencil" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
		Rename
		<ContextMenu.Shortcut>{shortcutToString(SHORTCUTS['note:rename'])}</ContextMenu.Shortcut>
	</ContextMenu.Item>
	<ContextMenu.Sub>
		<ContextMenu.SubTrigger class="flex items-center gap-2 group">
			<Icon name="motionCirclesLines" class="w-3.5 h-3.5 fill-foreground/70" />
			Move folder to...
		</ContextMenu.SubTrigger>
		<ContextMenu.SubContent class="w-40">
			{#each directories as directory (directory.path)}
				{#if directory.name !== entry.name}
					<ContextMenu.Item
						class="flex items-center gap-2 group"
						onclick={() => moveFolder(entry.path, directory.path)}
					>
						<Icon
							name="folder"
							class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground"
						/>
						{directory.name}
					</ContextMenu.Item>
				{/if}
			{/each}

			{#if directories.filter((directory) => directory.name !== entry.name).length === 0}
				<ContextMenu.Item
					class="flex items-center gap-2 group"
					onclick={async () => {
						// Create a new folder in parent directory
						const dirPath = await createFolder(entry.path.split('/').slice(0, -1).join('/'));

						// Move the folder to the new directory
						moveFolder(entry.path, dirPath);
					}}
				>
					<Icon
						name="folderPlus"
						class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground"
					/>
					New folder
					<ContextMenu.Shortcut>{shortcutToString(SHORTCUTS['folder:create'])}</ContextMenu.Shortcut
					>
				</ContextMenu.Item>
			{/if}
		</ContextMenu.SubContent>
	</ContextMenu.Sub>
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
			<ContextMenu.Item
				class="flex items-center gap-2 group"
				onclick={() => printDirectory(entry.path)}
			>
				<Icon name="note" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
				PDF / Print
			</ContextMenu.Item>
		</ContextMenu.SubContent>
	</ContextMenu.Sub>
	<ContextMenu.Separator />
	<ContextMenu.Item
		class="flex text-destructive data-[highlighted]:bg-destructive/20 data-[highlighted]:text-destructive items-center gap-2 group"
		onclick={() => deleteFolder(entry.path)}
	>
		<Icon name="bin" class="w-3.5 h-3.5 fill-destructive/70 group-hover:fill-destructive" />
		Delete
		<ContextMenu.Shortcut class="text-destructive/60"
			>{shortcutToString(SHORTCUTS['folder:delete'])}</ContextMenu.Shortcut
		>
	</ContextMenu.Item>
</ContextMenu.Content>
