<script lang="ts">
	import { moveNote } from '@/api/notes';
	import Icon from '$lib/components/shared/icon.svelte';
	import { appState } from '@/store.svelte';
	import * as Command from '@tactile/ui/components/command';
	import { getAllItems } from '../helpers';

	let { onPageChange }: { onPageChange: (page: string | undefined) => void } = $props();
</script>

<Command.Group heading="Move note to...">
	{#await getAllItems(true)}
		<!-- TODO: Make this a loading spinner -->
		<Command.Loading class="text-foreground/90">Loading folders...</Command.Loading>
	{:then folders}
		{#each folders as folder (folder.path)}
			{#if folder.path + `/${appState.activeFile?.split('/').pop()}` !== appState.activeFile}
				<Command.Item
					class="text-foreground/90 gap-3 [&>*]:text-foreground/90 [&>*]:aria-selected:text-foreground [&>*]:fill-foreground/50 [&>*]:aria-selected:fill-foreground"
					value={folder.path}
					onSelect={() => {
						moveNote(appState.activeFile || '', folder.path);
						onPageChange(undefined);
					}}
				>
					<Icon name="folder" />
					{folder.name.slice(1).replaceAll('/', ' > ')}
				</Command.Item>
			{/if}
		{/each}
	{:catch error}
		<Command.Item class="text-foreground/90">Error loading folders: {error.message}</Command.Item>
	{/await}
</Command.Group>
