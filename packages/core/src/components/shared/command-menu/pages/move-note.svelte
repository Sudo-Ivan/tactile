<script lang="ts">
	import { moveNote } from '../../../../api/notes';
	import Icon from '../../icon.svelte';
	import { commandItemClass, getAllItems } from '../../../../commands';
	import { appState } from '../../../../state/app.svelte';
	import * as Command from '@tactile/ui/components/command';

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
					class={commandItemClass}
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
