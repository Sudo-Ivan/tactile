<script lang="ts">
	import { openSearchResult } from '../../actions/search';
	import { isMobile } from '../../platform';
	import type { SearchResultParams } from '../../types';
	import { groupResultsByPath } from '../../utils/search';
	import { applyHighlights } from '../../utils/fuzzy';
	import * as Collapsible from '@tactile/ui/components/collapsible';
	import Label from '@tactile/ui/components/label/label.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import { ChevronDown, Loader } from 'lucide-svelte';

	let {
		query,
		results = [],
		loading = false
	}: {
		query: string;
		results?: SearchResultParams[];
		loading?: boolean;
	} = $props();

	let openState = $state<Record<string, boolean>>({});

	const groupedResults = $derived(groupResultsByPath(results));

	const MARK_CLASS = 'bg-[#f8a01e80] text-foreground rounded-[2px] px-px -mx-px';

	// Initialize all collapsibles as open
	$effect(() => {
		Object.keys(groupedResults).forEach((path) => {
			if (openState[path] === undefined) {
				openState[path] = true;
			}
		});
	});

	function toggleOpen(path: string) {
		openState[path] = !openState[path];
	}
</script>

<div class="w-full text-xs space-y-1 pl-1">
	<Label class="text-muted-foreground text-xs"
		>{results.length} results in {Object.keys(groupedResults).length} files</Label
	>
</div>

{#if Object.keys(groupedResults).length > 0 && !loading}
	{#each Object.keys(groupedResults) as path (path)}
		<Collapsible.Root open={openState[path]} class="w-full">
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
				{@const nameMatch = groupedResults[path].find((r) => r.kind === 'name')}
				{#if nameMatch}
					{@const nameHtml = applyHighlights(
						nameMatch.context_preview,
						nameMatch.highlights,
						MARK_CLASS
					)}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<p class="truncate">{@html nameHtml}</p>
				{:else}
					<p class="truncate">{path.split('/').pop()}</p>
				{/if}
			</Collapsible.Trigger>
			<Collapsible.Content class="mt-0.5 w-full gap-1.5 flex flex-col">
				{#each groupedResults[path] as result, index (result.context_preview + index)}
					{@const previewHtml = applyHighlights(
						result.context_preview,
						result.highlights,
						MARK_CLASS
					)}
					<button
						class={cn(
							'flex items-start min-w-full overflow-hidden text-start p-2 bg-secondary-background border rounded-md text-xs hover:bg-accent hover:text-accent-foreground',
							isMobile() && 'min-h-11'
						)}
						onclick={() => openSearchResult(path, result, query, index)}
					>
						{#if result.kind === 'name'}
							<span class="text-muted-foreground whitespace-nowrap">Name match&nbsp;·&nbsp;</span>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							<span class="truncate">{@html previewHtml}</span>
						{:else}
							{#if result.line}
								<span class="text-muted-foreground shrink-0 w-8 text-right pr-2 select-none"
									>{result.line}</span
								>
							{/if}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							<span class="whitespace-pre-wrap break-words min-w-0">{@html previewHtml}</span>
						{/if}
					</button>
				{/each}
			</Collapsible.Content>
		</Collapsible.Root>
	{/each}
{/if}

{#if results.length === 0 && !loading}
	<div class="w-full h-full flex flex-col gap-1 items-center justify-center">
		<Label class="text-muted-foreground text-xs">No results found</Label>
	</div>
{/if}

{#if loading}
	<div class="w-full h-full flex flex-col gap-0.5 items-center justify-center">
		<Loader class="w-4 h-4 animate-spin text-muted-foreground" />
		<Label class="text-muted-foreground text-xs">Searching collection...</Label>
	</div>
{/if}
