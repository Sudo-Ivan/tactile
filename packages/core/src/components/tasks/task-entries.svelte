<script lang="ts">
	import { openTaskResult } from '../../actions/search';
	import { closeNote, openNote } from '../../api/notes';
	import { TASK_MARKER } from '../../constants';
	import { isMobile } from '../../platform';
	import { appState } from '../../state/app.svelte';
	import type { SearchResultParams } from '../../types';
	import { renderMarkdownPreview } from '../../utils/markdown';
	import { groupResultsByPath } from '../../utils/search';
	import * as Collapsible from '@tactile/ui/components/collapsible';
	import Label from '@tactile/ui/components/label/label.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import { ChevronDown, Loader } from '@lucide/svelte';
	import { onMount } from 'svelte';

	// searchTasks performs the platform-specific task search: searchEntries
	// over the storage backend on web, the search_files tauri command on
	// desktop.
	let {
		searchTasks
	}: {
		searchTasks: () => Promise<SearchResultParams[]>;
	} = $props();

	let tasks = $state<SearchResultParams[]>([]);
	let loading = $state(false);
	let openState = $state<Record<string, boolean>>({});

	const groupedTasks = $derived(groupResultsByPath(tasks));

	// Initialize all collapsibles as open
	$effect(() => {
		Object.keys(groupedTasks).forEach((path) => {
			if (openState[path] === undefined) {
				openState[path] = true;
			}
		});
	});

	function toggleOpen(path: string) {
		openState[path] = !openState[path];
	}

	async function searchCollection() {
		loading = true;

		try {
			const results = await searchTasks();
			// Name matches (a file literally named "- [ ]...") are not tasks.
			tasks = results.filter((result) => result.kind === 'content');

			loading = false;
		} catch (error) {
			console.error('Error searching files:', error);
		}
	}

	// Re-search on every save so the task list stays current
	$effect(() => {
		return appState.editor.subscribeToSaveEvents(async () => {
			searchCollection();
		});
	});

	onMount(async () => {
		closeNote();

		await searchCollection();

		// Handle opening file on mount. On mobile stay on the task list instead
		if (!isMobile()) {
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
					isMobile() ? 'h-10' : 'h-7'
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
							isMobile() && 'min-h-11'
						)}
						onclick={() => openTaskResult(path, result.context_preview, index)}
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html renderMarkdownPreview(result.context_preview.replaceAll(TASK_MARKER, '').trim())}
					</button>
				{/each}
			</Collapsible.Content>
		</Collapsible.Root>
	{/each}
{/if}

{#if tasks.length === 0 && !loading}
	<div class="w-full h-full flex flex-col gap-1 items-center justify-center pt-6">
		<Label class="text-muted-foreground text-xs">No tasks found</Label>
		<p class="text-muted-foreground/70 text-xs text-center leading-relaxed">
			Add a <span class="font-mono">{TASK_MARKER} task</span> line in any note to see it here.
		</p>
	</div>
{/if}

{#if loading && tasks.length === 0}
	<div class="w-full h-full flex flex-col gap-0.5 items-center justify-center">
		<Loader class="w-3.5 h-3.5 animate-spin text-muted-foreground" />
		<Label class="text-muted-foreground text-xs">Searching collection...</Label>
	</div>
{/if}
