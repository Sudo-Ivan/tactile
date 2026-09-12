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
			folderOpenStates = new Array(entries.length).fill(false);
		}
	});

	// Get all directories in the collection
	let directories = $derived(entries.filter((entry) => entry.children));
</script>

{#each entries as entry, i (entry.path)}
	<EntryItem {entry} {directories} bind:open={folderOpenStates[i]}>
		{#if entry.children}
			<Entries entries={entry.children} />
		{/if}
	</EntryItem>
{/each}
