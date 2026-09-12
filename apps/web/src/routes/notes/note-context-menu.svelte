<script lang="ts">
	import { exportNote, printNote } from '@/api/export';
	import { createFolder } from '@/api/folders';
	import {
		deleteNote,
		duplicateNote,
		listNoteVersions,
		moveNote,
		openNote,
		restoreNoteVersion
	} from '@/api/notes';
	import Icon from '@/components/shared/icon.svelte';
	import { SHORTCUTS, UNTITLED_NAME } from '@/constants';
	import { appState } from '@/store.svelte';
	import type { FileEntry } from '@/types';
	import { formatTimeAgo, shortcutToString } from '@/utils';
	import * as ContextMenu from '@tactile/ui/components/context-menu';

	interface Props {
		entry: FileEntry;
		directories: FileEntry[];
		onRename: () => void;
	}

	let { entry, directories, onRename }: Props = $props();
</script>

<ContextMenu.Content class="w-44">
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
	<ContextMenu.Item class="flex items-center gap-2 group" onclick={() => duplicateNote(entry.path)}>
		<Icon name="copy" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
		Duplicate
		<ContextMenu.Shortcut>{shortcutToString(SHORTCUTS['note:duplicate'])}</ContextMenu.Shortcut>
	</ContextMenu.Item>
	<ContextMenu.Separator />
	<ContextMenu.Sub>
		<ContextMenu.SubTrigger class="flex items-center gap-2 group">
			<Icon name="motionCirclesLines" class="w-3.5 h-3.5 fill-foreground/70" />

			Move note to...
		</ContextMenu.SubTrigger>
		<ContextMenu.SubContent class="w-40">
			{#each directories as directory (directory.path)}
				{#if directory.name !== entry.name}
					<ContextMenu.Item
						class="flex items-center gap-2 group"
						onclick={() => moveNote(entry.path, directory.path)}
					>
						<Icon
							name="folder"
							class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground"
						/>
						{directory.name}
					</ContextMenu.Item>
				{/if}
			{/each}

			{#if directories.length === 0}
				<ContextMenu.Item
					class="flex items-center gap-2 group"
					onclick={async () => {
						// Create a new folder in parent directory
						await createFolder(entry.path.split('/').slice(0, -1).join('/'));

						// Move the folder to the new folder
						moveNote(
							entry.path,
							entry.path.split('/').slice(0, -1).join('/') + `/${UNTITLED_NAME}`
						);
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
			<Icon name="reload" class="w-3.5 h-3.5 fill-foreground/70" />
			Version history
		</ContextMenu.SubTrigger>
		<ContextMenu.SubContent class="w-48">
			<ContextMenu.Item
				class="flex items-center gap-2 group"
				onclick={() => {
					// The history panel reads the active file, so open the note first.
					if (appState.activeFile !== entry.path) {
						openNote(entry.path, true);
					}
					appState.isNoteDetailSidebarOpen = true;
					appState.noteDetailTab = 'history';
				}}
			>
				<Icon name="layer" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
				Browse all versions
			</ContextMenu.Item>
			<ContextMenu.Separator />
			{#await listNoteVersions(entry.path)}
				<ContextMenu.Item class="text-muted-foreground" disabled>Loading...</ContextMenu.Item>
			{:then versions}
				{#each versions as version (version.id)}
					<ContextMenu.Item
						class="flex items-center gap-2 group"
						onclick={() => restoreNoteVersion(entry.path, version.id)}
					>
						{formatTimeAgo(new Date(version.timestamp))}
					</ContextMenu.Item>
				{:else}
					<ContextMenu.Item class="text-muted-foreground" disabled
						>No previous versions</ContextMenu.Item
					>
				{/each}
			{:catch}
				<ContextMenu.Item class="text-muted-foreground" disabled
					>Failed to load versions</ContextMenu.Item
				>
			{/await}
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
				onclick={() => exportNote(entry.path)}
			>
				<Icon name="note" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
				Markdown (.md)
			</ContextMenu.Item>
			<ContextMenu.Item class="flex items-center gap-2 group" onclick={() => printNote(entry.path)}>
				<Icon name="note" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
				PDF / Print
			</ContextMenu.Item>
		</ContextMenu.SubContent>
	</ContextMenu.Sub>
	<ContextMenu.Separator />
	<ContextMenu.Item
		class="flex text-destructive data-[highlighted]:bg-destructive/20 data-[highlighted]:text-destructive items-center gap-2 group"
		onclick={() => deleteNote(entry.path)}
	>
		<Icon name="bin" class="w-3.5 h-3.5 fill-destructive/70 group-hover:fill-destructive" />
		Delete
		<ContextMenu.Shortcut class="text-destructive/60"
			>{shortcutToString(SHORTCUTS['note:delete'])}</ContextMenu.Shortcut
		>
	</ContextMenu.Item>
</ContextMenu.Content>
