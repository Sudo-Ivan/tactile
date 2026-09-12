<script lang="ts">
	import { openNote } from '@/api/notes';
	import Icon from '$lib/components/shared/icon.svelte';
	import * as Command from '@tactile/ui/components/command';
	import { getAllItems } from '../helpers';

	let { onPageChange }: { onPageChange: (page: string | undefined) => void } = $props();
</script>

<Command.Group heading="Open note...">
	{#await getAllItems()}
		<Command.Loading class="text-foreground/90">Loading notes...</Command.Loading>
	{:then notes}
		{#each notes as note (note.path)}
			<Command.Item
				class="text-foreground/90 gap-3 [&>*]:text-foreground/90 [&>*]:aria-selected:text-foreground [&>*]:fill-foreground/50 [&>*]:aria-selected:fill-foreground"
				value={note.path}
				onSelect={() => {
					openNote(note.path);
					onPageChange(undefined);
				}}
			>
				<Icon name="note" />
				{note.name.slice(1).replaceAll('/', ' > ')}
			</Command.Item>
		{/each}
	{:catch error}
		<Command.Item class="text-foreground/90">Error loading notes: {error.message}</Command.Item>
	{/await}
</Command.Group>
