<script lang="ts">
	import Tooltip from '@/components/shared/tooltip.svelte';
	import Icon from '@/components/shared/icon.svelte';
	import {
		NOTES_SEARCH_INPUT_ID,
		SEARCH_DEBOUNCE_MS,
		SEARCH_FILES_COMMAND,
		SEARCH_INPUT_FOCUS_DELAY_MS,
		SHORTCUTS
	} from '@/constants';
	import { appState } from '@/store.svelte';
	import type { SearchResultParams } from '@/utils/search';
	import { Button } from '@tactile/ui/components/button';
	import { cn } from '@tactile/ui/lib/utils';
	import { invoke } from '@tauri-apps/api/core';
	import { ALargeSmall, WholeWord } from 'lucide-svelte';

	let {
		// eslint-disable-next-line no-useless-assignment -- bindable prop written for the parent
		results = $bindable(),
		// eslint-disable-next-line no-useless-assignment -- bindable prop written for the parent
		loading = $bindable(),
		query = $bindable(),
		options = $bindable()
	}: {
		results: SearchResultParams[];
		loading: boolean;
		query: string;
		options: { caseSensitive: boolean; wholeWord: boolean };
	} = $props();

	let searchDebounce: ReturnType<typeof setTimeout>;

	// Focus the input when search becomes active
	$effect(() => {
		if (appState.collectionSearchActive) {
			const input = document.getElementById(NOTES_SEARCH_INPUT_ID) as HTMLInputElement;
			if (input) {
				// Wait for the input to be visible
				setTimeout(() => {
					input.focus();
				}, SEARCH_INPUT_FOCUS_DELAY_MS);
			}
		}
	});

	async function searchCollection() {
		if (!query) {
			results = [];
			return;
		}

		loading = true;

		try {
			results = (await invoke(SEARCH_FILES_COMMAND, {
				dirPath: appState.collection,
				query: query,
				caseSensitive: options.caseSensitive,
				matchWord: options.wholeWord,
				recursive: true
			})) as SearchResultParams[];

			loading = false;
		} catch (error) {
			console.error('Error searching files:', error);
		}
	}

	// close search
	function closeSearch() {
		appState.collectionSearchActive = false;
		query = '';
		options = { caseSensitive: false, wholeWord: false };
		results = [];
	}
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
			id={NOTES_SEARCH_INPUT_ID}
			class="w-full bg-transparent outline-none placeholder:text-muted-foreground h-[30px] text-[13px]"
			type="text"
			placeholder="Search"
			autocomplete="off"
			autocorrect="off"
			bind:value={query}
			onkeydown={(e) => {
				clearTimeout(searchDebounce);

				// Start search debounce timeout
				searchDebounce = setTimeout(() => {
					searchCollection();
				}, SEARCH_DEBOUNCE_MS);

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
					options.caseSensitive = !options.caseSensitive;
					searchCollection();
				}}
			>
				<ALargeSmall
					class={cn(
						'w-[18px] h-[18px] stroke-muted-foreground group-hover:stroke-foreground transition-all stroke-[1.5px]',
						options.caseSensitive ? 'stroke-foreground' : ''
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
					options.wholeWord = !options.wholeWord;
					searchCollection();
				}}
			>
				<WholeWord
					class={cn(
						'w-4 h-4 stroke-muted-foreground group-hover:stroke-foreground transition-all stroke-[1.5px]',
						options.wholeWord ? 'stroke-foreground' : ''
					)}
				/>
			</Button>
		</Tooltip>
		<Tooltip text="Close" side="bottom" shortcut={SHORTCUTS['notes:search']}>
			<Button
				size="icon"
				variant="ghost"
				scale="md"
				class="h-7 w-6 group shrink-0 transition-all hover:bg-transparent fill-muted-foreground hover:fill-foreground"
				onclick={() => {
					closeSearch();
				}}
			>
				<Icon name="x" class="w-4 h-4" />
			</Button>
		</Tooltip>
	</div>
</div>
