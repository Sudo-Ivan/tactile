<script lang="ts">
	import type { FileEntry } from '@/types';
	import Entries from './entries.svelte';
	import EntryItem from './entry-item.svelte';

	interface Props {
		entries: FileEntry[];
		folderOpenStates?: boolean[];
	}

	let { entries, folderOpenStates = $bindable([]) }: Props = $props();

	// Watch for entries changes and update folderOpenStates array
	// This is necessary as the folderOpenStates array would be empty until collapsible is used to set the initial state
	$effect(() => {
		if (folderOpenStates.length !== entries.length) {
			folderOpenStates = entries.map((_, i) => folderOpenStates[i] ?? false);
		}
	});
</script>

{#if folderOpenStates.length === entries.length}
	{#each entries as entry, i (entry.path)}
		<EntryItem {entry} {entries} bind:open={folderOpenStates[i]}>
			{#if entry.children}
				<Entries entries={entry.children} />
			{/if}
		</EntryItem>
	{/each}
{/if}
