<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/shared/icon.svelte';
	import { getCollections, loadCollection } from '@/api/collection';
	import { ROUTES } from '@/constants';
	import { appState } from '@/store.svelte';
	import { formatTimeAgo } from '@/utils/format';
	import * as Command from '@tactile/ui/components/command';

	let { onPageChange }: { onPageChange: (page: string | undefined) => void } = $props();
</script>

<Command.Group heading="Open collection">
	<Command.Item
		class="text-foreground/90 gap-3 [&>*]:text-foreground/90 [&>*]:aria-selected:text-foreground [&>*]:fill-foreground/50 [&>*]:aria-selected:fill-foreground"
		onSelect={async () => {
			await goto(resolve(ROUTES.notes));
			loadCollection();
			onPageChange(undefined);
		}}
	>
		<Icon name="folderPlus" />
		Open new collection
	</Command.Item>
</Command.Group>
{#await getCollections()}
	<Command.Loading class="text-foreground/90">Recent collections</Command.Loading>
{:then collections}
	{#if collections.filter((c) => c.path !== appState.collection).length > 0}
		<Command.Group heading="Browse recent collections">
			{#each collections
				.filter((c) => c.path !== appState.collection)
				.sort((a, b) => +new Date(b.lastOpened) - +new Date(a.lastOpened)) as collection (collection.path)}
				<Command.Item
					class="text-foreground/90 gap-3 [&>*]:text-foreground/90 [&>*]:aria-selected:text-foreground [&>*]:fill-foreground/50 [&>*]:aria-selected:fill-foreground"
					value={collection.path}
					onSelect={async () => {
						await goto(resolve(ROUTES.notes));
						loadCollection(collection.path);
						onPageChange(undefined);
					}}
				>
					<div class="flex w-full items-center justify-between">
						<div class="flex items-center gap-1.5">
							<Icon name="folder" />
							<span class="text-foreground/80 group-hover:text-foreground"></span>
							{collection.name}
						</div>
						<span class="ml-auto text-xs text-muted-foreground h-full"
							>{formatTimeAgo(new Date(collection.lastOpened))}
						</span>
					</div>
				</Command.Item>
			{/each}
		</Command.Group>
	{/if}
{:catch error}
	<Command.Group heading="Browse recent collections">
		<Command.Item class="text-foreground/90"
			>Error loading collections: {error.message}</Command.Item
		>
	</Command.Group>
{/await}
