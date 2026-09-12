<script lang="ts">
	import { openNote } from '@/api/notes';
	import Icon from '$lib/components/shared/icon.svelte';
	import * as Command from '@tactile/ui/components/command';
	import { commandItemClass, getAllItems } from './helpers';

	interface Props {
		onPageChange: (page: string | undefined) => void;
	}

	let { onPageChange }: Props = $props();
</script>

<Command.Group heading="Open note...">
	{#await getAllItems()}
		<Command.Loading class="text-foreground/90">Loading notes...</Command.Loading>
	{:then notes}
		{#each notes as note (note.path)}
			<Command.Item
				class={commandItemClass}
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
