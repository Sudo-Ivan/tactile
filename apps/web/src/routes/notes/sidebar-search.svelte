<script module lang="ts">
	import type { SearchResultParams } from '@/types';

	export interface CollectionSearch {
		value: string;
		loading: boolean;
		caseSensitive: boolean;
		wholeWord: boolean;
		results: SearchResultParams[];
	}
</script>

<script lang="ts">
	import Icon from '@/components/shared/icon.svelte';
	import Tooltip from '@/components/shared/tooltip.svelte';
	import { SHORTCUTS, TIMING } from '@/constants';
	import { appState } from '@/store.svelte';
	import { searchEntries } from '@/utils';
	import { Button } from '@tactile/ui/components/button';
	import { cn } from '@tactile/ui/lib/utils';
	import { ALargeSmall, WholeWord } from 'lucide-svelte';

	interface Props {
		search: CollectionSearch;
	}

	let { search = $bindable() }: Props = $props();

	let searchDebounce: ReturnType<typeof setTimeout>;

	async function searchCollection() {
		if (!search.value) {
			search.results = [];
			return;
		}

		search.loading = true;

		try {
			search.results = await searchEntries(appState.collection!, search.value, {
				caseSensitive: search.caseSensitive,
				mode: search.wholeWord ? 'word' : 'fuzzy'
			});
			search.loading = false;
		} catch (error) {
			console.error('Error searching files:', error);
		}
	}

	// close search
	function closeSearch() {
		appState.collectionSearchActive = false;
		search.value = '';
		search.caseSensitive = false;
		search.wholeWord = false;
		search.results = [];
	}

	$effect(() => {
		// Should focus inputs when search is active
		if (appState.collectionSearchActive) {
			const input = document.querySelector('#notesSearch') as HTMLInputElement;
			if (input) {
				// Wait 250ms for the input to be visible
				setTimeout(() => {
					// Focus the input
					input.focus();
				}, TIMING.searchFocusDelay);
			}
		}
	});
</script>

<div
	class={cn(
		'absolute pb-[0.5px] flex flex-row items-center justify-center w-full h-full px-[5px] gap-1 shrink-0 transform transition-all translate-y-12',
		appState.collectionSearchActive && 'translate-y-0'
	)}
>
	<div
		class="rounded-md w-full flex items-center justify-start bg-background pl-2 pr-1 gap-0.5 border focus-within:ring-1 focus-within:ring-ring transition-all"
	>
		<input
			id="notesSearch"
			class="w-full bg-transparent outline-none placeholder:text-muted-foreground h-[30px] text-[13px]"
			type="text"
			placeholder="Search"
			autocomplete="off"
			autocorrect="off"
			bind:value={search.value}
			onkeydown={(e) => {
				clearTimeout(searchDebounce);

				// Start search debounce timeout
				searchDebounce = setTimeout(() => {
					searchCollection();
				}, TIMING.searchDebounce);

				// Search on enter, also clear timeout
				if (e.key === 'Enter') {
					clearTimeout(searchDebounce);
					searchCollection();
				}

				// Close search on escape
				if (e.key === 'Escape') {
					closeSearch();
				}
			}}
		/>
		<Tooltip text="Case sensitive" side="bottom">
			<Button
				size="icon"
				variant="ghost"
				scale="md"
				class="h-7 w-6 shrink-0 group hover:bg-transparent"
				onclick={() => {
					search.caseSensitive = !search.caseSensitive;
					searchCollection();
				}}
			>
				<ALargeSmall
					class={cn(
						'w-[18px] h-[18px] stroke-muted-foreground group-hover:stroke-foreground transition-all stroke-[1.5px]',
						search.caseSensitive ? 'stroke-foreground' : ''
					)}
				/>
			</Button>
		</Tooltip>
		<Tooltip text="Whole word" side="bottom">
			<Button
				size="icon"
				variant="ghost"
				scale="md"
				class="h-7 w-6 shrink-0 group hover:bg-transparent"
				onclick={() => {
					search.wholeWord = !search.wholeWord;
					searchCollection();
				}}
			>
				<WholeWord
					class={cn(
						'w-4 h-4 stroke-muted-foreground group-hover:stroke-foreground transition-all stroke-[1.5px]',
						search.wholeWord ? 'stroke-foreground' : ''
					)}
				/>
			</Button>
		</Tooltip>
		<Tooltip text="Close" side="bottom" shortcut={SHORTCUTS['notes:search']}>
			<Button
				size="icon"
				variant="ghost"
				scale="md"
				class="h-7 w-6 group shrink-0 transition-all hover:bg-transparent fill-muted-foreground hover:fill-foreground "
				onclick={() => {
					closeSearch();
				}}
			>
				<Icon name="x" class="w-4 h-4" />
			</Button>
		</Tooltip>
	</div>
</div>
