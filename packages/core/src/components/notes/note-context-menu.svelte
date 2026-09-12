<script lang="ts">
	import { exportNote } from '../../api/export';
	import {
		duplicateNote,
		listNoteVersions,
		openNoteHistory,
		restoreNoteVersion
	} from '../../api/notes';
	import { SHORTCUTS } from '../../constants';
	import { isMobile, platformHooks } from '../../platform';
	import type { FileEntry } from '../../types';
	import { formatTimeAgo } from '../../utils/format';
	import { shortcutToString } from '../../utils/keyboard';
	import * as ContextMenu from '@tactile/ui/components/context-menu';
	import Icon from '../shared/icon.svelte';
	import MoveToMenu from './move-to-menu.svelte';

	// Actions come in as callbacks, and the "printable" export differs per
	// platform: web prints through the browser (PDF / Print), desktop saves a
	// printable HTML file. showVersionItems renders the inline version
	// restore submenu (web); otherwise a single item opens the history
	// panel (desktop).
	let {
		entry,
		entries,
		onRename,
		onDelete,
		onPrint,
		printLabel,
		showVersionItems = false
	}: {
		entry: FileEntry;
		entries: FileEntry[];
		onRename: () => void;
		onDelete: () => void;
		onPrint: () => void;
		printLabel: string;
		showVersionItems?: boolean;
	} = $props();

	// Reveal-in-file-manager only exists where the OS file manager is
	// reachable (desktop); web never registers the hook.
	const showInFolder = platformHooks()?.showInFolder;
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
	{#if !isMobile() && showInFolder}
		<ContextMenu.Item
			class="flex items-center gap-2 group"
			onclick={() => showInFolder(entry.path)}
		>
			<Icon name="eye" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
			Show in {platformHooks()?.fileManagerLabel?.() ?? 'file manager'}
			<ContextMenu.Shortcut
				>{shortcutToString(SHORTCUTS['note:show-in-folder'])}</ContextMenu.Shortcut
			>
		</ContextMenu.Item>
	{/if}
	<MoveToMenu {entry} {entries} type="note" />
	{#if showVersionItems}
		<ContextMenu.Sub>
			<ContextMenu.SubTrigger class="flex items-center gap-2 group">
				<Icon name="reload" class="w-3.5 h-3.5 fill-foreground/70" />
				Version history
			</ContextMenu.SubTrigger>
			<ContextMenu.SubContent class="w-48">
				<ContextMenu.Item
					class="flex items-center gap-2 group"
					onclick={() => {
						openNoteHistory(entry.path);
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
	{:else}
		<ContextMenu.Item
			class="flex items-center gap-2 group"
			onclick={() => {
				openNoteHistory(entry.path);
			}}
		>
			<Icon name="reload" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
			Version history
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
				onclick={() => exportNote(entry.path)}
			>
				<Icon name="note" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
				Markdown (.md)
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
			>{shortcutToString(SHORTCUTS['note:delete'])}</ContextMenu.Shortcut
		>
	</ContextMenu.Item>
</ContextMenu.Content>
