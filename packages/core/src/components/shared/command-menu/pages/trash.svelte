<script lang="ts">
	import {
		deleteTrashItem,
		emptyTrash,
		listTrash,
		restoreFromTrash
	} from '@tactile/core/api/trash';
	import { TRASH_PENDING_TIMEOUT_MS } from '../../../../constants';
	import Icon from '../../icon.svelte';
	import { commandItemClass as itemClass } from '../../../../commands';
	import { appState } from '../../../../state/app.svelte';
	import { formatTimeAgo } from '../../../../utils/format';
	import * as Command from '@tactile/ui/components/command';

	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- page prop kept for parity with other command pages
	let { onPageChange }: { onPageChange: (page: string | undefined) => void } = $props();

	// Bumped after every mutation so the list refetches.
	let trashVersion = $state(0);
	let errorMessage = $state('');

	// Destructive actions need a second select to confirm. Holds 'empty' or
	// 'delete:<name>' while armed.
	let pending = $state<string | null>(null);
	let pendingTimer: ReturnType<typeof setTimeout> | undefined;

	function arm(key: string): boolean {
		if (pending === key) {
			pending = null;
			clearTimeout(pendingTimer);
			return true;
		}
		pending = key;
		clearTimeout(pendingTimer);
		pendingTimer = setTimeout(() => (pending = null), TRASH_PENDING_TIMEOUT_MS);
		return false;
	}

	async function act(fn: () => Promise<void>) {
		errorMessage = '';
		try {
			await fn();
		} catch (error) {
			console.error('trash: action failed', error);
			errorMessage = error instanceof Error ? error.message : 'Action failed';
		}
		trashVersion++;
	}
</script>

<Command.Group heading={`Trash ${appState.collection ?? ''}`}>
	{#key trashVersion}
		{#await listTrash()}
			<Command.Loading class="text-foreground/90">Loading trash...</Command.Loading>
		{:then items}
			{#if items.length > 0}
				{#if errorMessage}
					<Command.Item class="text-destructive text-xs" disabled>{errorMessage}</Command.Item>
				{/if}
				<Command.Item
					class={itemClass}
					value="__empty_trash__"
					onSelect={() => {
						if (arm('empty')) act(emptyTrash);
					}}
				>
					<Icon name="bin" />
					{#if pending === 'empty'}
						<span class="text-destructive">Confirm empty trash ({items.length} items)</span>
					{:else}
						Empty trash ({items.length} {items.length === 1 ? 'item' : 'items'})
					{/if}
				</Command.Item>
				{#each items as item (item.name)}
					<Command.Item
						class={itemClass}
						value={item.name}
						onSelect={() => act(() => restoreFromTrash(item.name))}
					>
						<Icon name={item.isFolder ? 'folder' : 'note'} />
						<div class="flex w-full items-center justify-between gap-2">
							<span class="truncate text-foreground/80">
								{item.originalPath
									.replace(appState.collection ?? '', '')
									.split('/')
									.filter(Boolean)
									.join(' > ')}
							</span>
							<span class="text-xs text-muted-foreground shrink-0">
								{formatTimeAgo(new Date(item.deletedAt))}
							</span>
						</div>
					</Command.Item>
				{/each}
				<Command.Group heading="Delete permanently">
					{#each items as item (item.name)}
						<Command.Item
							class={itemClass}
							value={`delete:${item.name}`}
							onSelect={() => {
								if (arm(`delete:${item.name}`)) act(() => deleteTrashItem(item.name));
							}}
						>
							<Icon name="bin" />
							{#if pending === `delete:${item.name}`}
								<span class="text-destructive"
									>Confirm delete: {item.originalPath.split('/').pop()}</span
								>
							{:else}
								{item.originalPath.split('/').pop()}
							{/if}
						</Command.Item>
					{/each}
				</Command.Group>
			{:else}
				<Command.Item class="text-muted-foreground" disabled>Trash is empty</Command.Item>
			{/if}
		{:catch error}
			<Command.Item class="text-foreground/90">Error loading trash: {error.message}</Command.Item>
		{/await}
	{/key}
</Command.Group>
