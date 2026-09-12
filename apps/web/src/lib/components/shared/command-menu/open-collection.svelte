<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/shared/icon.svelte';
	import { db } from '$lib/database/client';
	import { entry as entryTable } from '$lib/database/schema';
	import { getCollections, loadCollection } from '@/api/collection';
	import { MARKDOWN_EXTENSION, ROUTES } from '@/constants';
	import { appState } from '@/store.svelte';
	import { formatTimeAgo } from '@/utils';
	import * as Command from '@tactile/ui/components/command';
	import { Loader } from 'lucide-svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { commandItemClass } from './helpers';

	interface Props {
		loading?: { loading: boolean; progress: number } | undefined;
		onPageChange: (page: string | undefined) => void;
	}

	let { loading = $bindable(undefined), onPageChange }: Props = $props();

	let files = $state<FileList | undefined>(undefined);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function openCollection() {
		if (!files || files.length === 0) {
			return console.error('No files selected');
		}

		// Set loading state
		loading = { loading: true, progress: 0 };

		// Load collection
		const collectionName = files[0]?.webkitRelativePath.split('/')[0];
		await loadCollection(`/${collectionName}`);

		const processedPaths = new SvelteSet<string>();

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (!file) continue;

			const filePath = `/${file.webkitRelativePath}`;
			const pathParts = file.webkitRelativePath.split('/');
			const fileName = pathParts[pathParts.length - 1];

			// Log progress
			let progress = Math.round(((i + 1) / files.length) * 100);
			loading = { loading: true, progress };

			// Create folder entries
			let currentPath = '';
			for (let j = 0; j < pathParts.length - 1; j++) {
				currentPath += '/' + pathParts[j];
				if (!processedPaths.has(currentPath)) {
					await createFolderEntry(currentPath, collectionName);
					processedPaths.add(currentPath);
				}
			}

			// Process file
			if (file.name.toLowerCase().endsWith(MARKDOWN_EXTENSION)) {
				try {
					const fileText = await file.text();
					await db.insert(entryTable).values({
						name: fileName,
						path: filePath,
						content: fileText,
						parentPath: currentPath,
						collectionPath: `/${collectionName}`,
						size: file.size,
						isFolder: false
					});
					console.log('Inserted file:', fileName);
				} catch (error) {
					console.error('Error processing file:', fileName, error);
				}
			} else {
				console.warn('Skipping non-Markdown file:', fileName);
			}
		}

		// Reset loading state
		loading = undefined;

		// Close dialog
		await goto(resolve(ROUTES.notes));
		onPageChange(undefined);
	}

	async function createFolderEntry(path: string, collectionName: string) {
		const pathParts = path.split('/').filter(Boolean);
		const folderName = pathParts[pathParts.length - 1];
		const parentPath = '/' + pathParts.slice(0, -1).join('/');

		try {
			await db.insert(entryTable).values({
				name: folderName,
				path: path,
				content: undefined,
				parentPath: parentPath,
				collectionPath: `/${collectionName}`,
				isFolder: true
			});
			console.log('Created folder entry:', path);
		} catch (error) {
			console.error('Error creating folder entry:', path, error);
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
