<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/shared/icon.svelte';
	import { getCollections, loadCollection } from '@/api/collection';
	import { MARKDOWN_EXTENSION, ROUTES } from '@/constants';
	import { getStorage } from '@/storage';
	import { appState } from '@/store.svelte';
	import { formatTimeAgo } from '@/utils';
	import * as Command from '@tactile/ui/components/command';
	import { Loader } from 'lucide-svelte';
	import { commandItemClass } from './helpers';

	interface Props {
		loading?: { loading: boolean; progress: number } | undefined;
		onPageChange: (page: string | undefined) => void;
	}

	let { loading = $bindable(undefined), onPageChange }: Props = $props();

	let files = $state<FileList | undefined>(undefined);
	let fileInput = $state<HTMLInputElement | null>(null);
	let importError = $state<string | undefined>(undefined);

	async function openCollection() {
		if (!files || files.length === 0) {
			return console.error('No files selected');
		}

		const collectionName = files[0]?.webkitRelativePath.split('/')[0];
		if (!collectionName) {
			importError = 'Could not determine collection name from the selected files.';
			return;
		}

		// Set loading state
		importError = undefined;
		loading = { loading: true, progress: 0 };

		try {
			const storage = await getStorage();
			const collectionPath = `/${collectionName}`;

			// Create the collection root up front so files always land in an
			// existing directory.
			await storage.mkdir(collectionPath, { recursive: true });

			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				if (!file) continue;

				const filePath = `/${file.webkitRelativePath}`;

				// Log progress
				let progress = Math.round(((i + 1) / files.length) * 100);
				loading = { loading: true, progress };

				// Create parent directories for every file, not only markdown
				// ones, so empty folders and folders that only hold skipped
				// files keep their structure.
				try {
					const parentDir = filePath.split('/').slice(0, -1).join('/');
					await storage.mkdir(parentDir, { recursive: true });

					if (file.name.toLowerCase().endsWith(MARKDOWN_EXTENSION)) {
						const fileText = await file.text();
						await storage.writeTextFile(filePath, fileText, { keepVersion: false });
						console.log('Imported file:', file.name);
					} else {
						console.warn('Skipping non-Markdown file:', file.name);
					}
				} catch (error) {
					console.error('Error processing file:', file.name, error);
				}
			}

			// Register and activate the collection once files are on disk.
			await loadCollection(collectionPath);

			// Reset loading state
			loading = undefined;

			// Close dialog
			await goto(resolve(ROUTES.notes));
			onPageChange(undefined);
		} catch (error) {
			// Fatal failures (quota, storage gone) leave a partial collection
			// on disk, which is recoverable by re-importing or deleting it.
			console.error('Import failed:', error);
			loading = undefined;
			importError = error instanceof Error ? error.message : 'Import failed.';
		}
	}

	$effect(() => {
		if (files) {
			openCollection();
		}
	});
</script>

{#if loading}
	<Command.Empty class="text-foreground/60 font-light">
		<div class="flex flex-col items-center gap-1.5">
			<Loader class="w-3.5 h-3.5 animate-spin text-muted-foreground" />
			<div class="flex flex-col gap-0.5">
				Loading collection... ({loading.progress}%)
				<span class="text-xs text-muted-foreground"
					>Hint: You can close this window and continue working.</span
				>
			</div>
		</div>
	</Command.Empty>
{:else if importError}
	<Command.Empty class="text-destructive/80 font-light">
		<div class="flex flex-col items-center gap-1.5">
			<div class="flex flex-col gap-0.5 text-center">
				Import failed<br />
				<span class="text-xs">{importError}</span>
			</div>
		</div>
	</Command.Empty>
{:else}
	<Command.Group heading="Open collection">
		<Command.Item
			class={commandItemClass}
			onSelect={async () => {
				fileInput?.click();
			}}
		>
			<Icon name="folderPlus" />
			<!-- Accept folders only -->
			<input type="file" bind:files bind:this={fileInput} class="hidden" webkitdirectory multiple />
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
						class={commandItemClass}
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
								<span class="text-foreground/80 group:hover:text-foreground/100"></span>
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
{/if}
