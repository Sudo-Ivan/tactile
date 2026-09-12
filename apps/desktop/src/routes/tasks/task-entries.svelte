<script lang="ts">
	import { openNote } from '@/api/notes';
	import { SEARCH_FILES_COMMAND, SEARCH_RESULT_FOCUS_DELAY_MS } from '@/constants';
	import { isMobile } from '@/platform.svelte';
	import { appState } from '@/store.svelte';
	import { goToSearchResult } from '@/utils/editor';
	import type { SearchResultParams } from '@/utils/search';
	import * as Collapsible from '@tactile/ui/components/collapsible';
	import Label from '@tactile/ui/components/label/label.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import { invoke } from '@tauri-apps/api/core';
	import { ChevronDown, Loader } from 'lucide-svelte';
	import markdownit from 'markdown-it';
	import { onMount } from 'svelte';

	let tasks = $state<SearchResultParams[]>([]);
	let loading = $state(false);
	let openState = $state<Record<string, boolean>>({});

	const groupedTasks = $derived(groupResults(tasks));

	// Initialize all collapsibles as open
	$effect(() => {
		Object.keys(groupedTasks).forEach((path) => {
			if (openState[path] === undefined) {
				openState[path] = true;
			}
		});
	});

	function groupResults(
		results: { path: string; context_preview: string }[]
	): Record<string, { context_preview: string }[]> {
		const grouped: Record<string, { context_preview: string }[]> = {};

		results.forEach((result) => {
			const path = result.path;
			const context_preview = result.context_preview;

			if (!grouped[path]) {
				grouped[path] = [];
			}

			grouped[path].push({ context_preview });
		});

		return grouped;
	}

	function toggleOpen(path: string) {
		openState[path] = !openState[path];
	}

	async function searchCollection() {
		loading = true;

		try {
			const results = (await invoke(SEARCH_FILES_COMMAND, {
				dirPath: appState.collection,
				query: '- [ ]',
				caseSensitive: false,
				matchWord: false,
				recursive: true,
				// Literal matching only: fuzzy search would treat the task
				// marker's punctuation as a subsequence and catch unrelated lines.
				mode: 'exact'
			})) as SearchResultParams[];
			// Name matches (a file literally named "- [ ]...") are not tasks.
			tasks = results.filter((result) => result.kind === 'content');

			loading = false;
		} catch (error) {
			console.error('Error searching files:', error);
		}
	}

	// Subscribe to save events
	$effect(() => {
		return appState.editor.subscribeToSaveEvents(async () => {
			// Re-search the collection
			searchCollection();
		});
	});

	onMount(async () => {
		appState.activeFile = null;

		await searchCollection();

		// Handle opening file on mount. On mobile stay on the task list instead
		if (!isMobile) {
			const activeFileInResults = tasks.find((task) => task.path === appState.activeFile);
			if (activeFileInResults) {
				openNote(activeFileInResults.path, true);
			} else if (tasks[0] && appState.activeFile !== tasks[0].path) {
				openNote(tasks[0].path, true);
			}
		}
	});
</script>

<div class="w-full text-xs space-y-1 pl-1">
	<Label class="text-muted-foreground text-xs">{tasks.length} tasks in collection</Label>
</div>

{#if Object.keys(groupedTasks).length > 0}
	{#each Object.keys(groupedTasks) as path (path)}
		<Collapsible.Root open={openState[path]} class="w-full transition-all">
			<Collapsible.Trigger
				class={cn(
					'text-[13px] w-full text-secondary-foreground flex items-center justify-start gap-1.5 group hover:text-foreground transition-all',
					isMobile ? 'h-10' : 'h-7'
				)}
				onclick={() => toggleOpen(path)}
			>
				<ChevronDown
					class={cn(
						'w-3.5 h-3.5 transform transition-all shrink-0 text-muted-foreground group-hover:text-foreground',
						!openState[path] ? '-rotate-90' : 'rotate-0'
					)}
				/>
				<p class="truncate">{path.split('/').pop()}</p>
			</Collapsible.Trigger>
			<Collapsible.Content class="mt-0.5 w-full gap-1.5 flex flex-col">
				{#each groupedTasks[path] as result, index (result.context_preview)}
					<button
						class={cn(
							'flex items-start min-w-full overflow-hidden text-start p-2 bg-secondary-background border rounded-md text-xs hover:bg-accent hover:text-accent-foreground',
							isMobile && 'min-h-11'
						)}
						onclick={async () => {
							appState.editorSearchValue = '';
							if (appState.activeFile !== path) {
								openNote(path, true);
							}

							setTimeout(() => {
								if (!appState.editorSearchActive) appState.editorSearchActive = true;
								appState.editor.instance.commands.blur();
								if (
									appState.editorSearchValue !==
									result.context_preview.replaceAll('- [ ]', '').trim()
								)
									appState.editorSearchValue = result.context_preview
										.replaceAll('- [ ]', '')
										.trim();
								goToSearchResult(appState.editor.instance, index);
								appState.editor.instance.commands.setSearchResult(index);
							}, SEARCH_RESULT_FOCUS_DELAY_MS);
						}}
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html markdownit({
							html: true,
							linkify: true,
							typographer: true
						}).render(result.context_preview.replaceAll('- [ ]', '').trim())}
					</button>
				{/each}
			</Collapsible.Content>
		</Collapsible.Root>
	{/each}
{/if}

{#if tasks.length === 0 && !loading}
	<div class="w-full h-full flex flex-col gap-1 items-center justify-center">
		<Label class="text-muted-foreground text-xs">No tasks found</Label>
	</div>
{/if}

{#if loading && tasks.length === 0}
	<div class="w-full h-full flex flex-col gap-0.5 items-center justify-center">
		<Loader class="w-3.5 h-3.5 animate-spin text-muted-foreground" />
		<Label class="text-muted-foreground text-xs">Searching collection...</Label>
	</div>
{/if}
