<script lang="ts">
	import Icon from '@/components/shared/icon.svelte';
	import Shortcut from '@/components/shared/shortcut.svelte';
	import Tooltip from '@/components/shared/tooltip.svelte';
	import { EDITOR_SEARCH_INPUT_ID, SHORTCUTS } from '@/constants';
	import { isMobile } from '@/platform.svelte';
	import { appState } from '@/store.svelte';
	import { getEditorSelectionText, goToSearchResult } from '@/utils/editor';
	import { Button } from '@tactile/ui/components/button';
	import * as Collapsible from '@tactile/ui/components/collapsible';
	import { Input } from '@tactile/ui/components/input';
	import { cn } from '@tactile/ui/lib/utils';
	import { ALargeSmall, Replace, ReplaceAll, WholeWord } from 'lucide-svelte';

	let replaceValue = $state('');
	let caseSensitive = $state(false);
	let wholeWord = $state(false);
	let expanded = $state(false);

	const editor = $derived(appState.editor.instance);

	$effect(() => {
		if (editor) {
			editor.commands.setReplaceTerm(replaceValue);
			editor.commands.setCaseSensitive(caseSensitive);
		}
	});

	const close = () => {
		appState.editorSearchValue = '';
		replaceValue = '';
		caseSensitive = false;
		wholeWord = false;
		expanded = false;
		editor.commands.resetIndex();
		appState.editorSearchActive = false;
	};

	// Focus the input when search becomes active
	$effect(() => {
		if (appState.editorSearchActive) {
			const input = document.getElementById(EDITOR_SEARCH_INPUT_ID) as HTMLInputElement;
			if (input) {
				input.focus();
			}
		}
	});

	// Keep the editor search term in sync with the search value
	$effect(() => {
		const value = appState.editorSearchValue;
		if (editor) {
			// Filter out regex special characters
			// TODO: Find a fix for this, for some reason regex characters throw an error and makes app unresponsive
			const filteredValue = value.replace(/[.*+?^${}()|[\]\\]/g, '');

			if (wholeWord) {
				editor.commands.setSearchTerm(`\\b${filteredValue}\\b`);
			} else {
				editor.commands.setSearchTerm(filteredValue);
			}

			try {
				goToSearchResult(editor);
			} catch (error) {
				// This is usually triggered while search active is true and page is navigated
				console.error('Error selecting search result:', error);
			}
		}
	});
</script>

<div
	class={cn(
		'fixed min-h-10 bg-secondary-background border z-30 rounded-md flex items-center px-1 py-1.5 transition-all duration-200',
		isMobile ? 'w-[calc(100vw-2rem)]' : 'w-96',
		appState.editorSearchActive ? 'translate-y-0' : '-translate-y-96',
		isMobile
			? appState.collectionSettings.editor.show_toolbar
				? 'top-[96px]'
				: 'top-[56px]'
			: appState.platform === 'darwin'
				? appState.collectionSettings.editor.show_toolbar
					? 'top-[80px]'
					: 'top-[48px]'
				: appState.collectionSettings.editor.show_toolbar
					? 'top-[44px]'
					: 'top-[12px]'
	)}
	style={`right: ${appState.isNoteDetailSidebarOpen && !isMobile ? appState.noteDetailSidebarWidth + 16 : 16}px`}
>
	<Shortcut
		options={SHORTCUTS['editor:search']}
		callback={() => {
			if (appState.editorSearchActive) {
				close();
			} else {
				appState.editorSearchValue = getEditorSelectionText(editor) || '';
				appState.editorSearchActive = true;
			}
		}}
	/>
	<Shortcut
		options={{ key: 'Escape' }}
		callback={() => {
			if (appState.editorSearchActive) {
				close();
			}
		}}
	/>
	<Shortcut
		options={{ key: 'Enter' }}
		callback={() => {
			if (appState.editorSearchActive) {
				editor.commands.nextSearchResult();
				goToSearchResult(editor);
			}
		}}
	/>
	<Shortcut
		options={{ shift: true, key: 'Enter' }}
		callback={() => {
			if (appState.editorSearchActive) {
				editor.commands.previousSearchResult();
				goToSearchResult(editor);
			}
		}}
	/>
	<Collapsible.Root
		class="flex relative flex-col gap-1 items-center justify-between w-full h-full pl-7"
		bind:open={expanded}
	>
		<Collapsible.Trigger class="absolute left-0 flex items-center h-full w-7">
			<Button
				size="icon"
				variant="ghost"
				scale="md"
				class="h-full w-6 fill-muted-foreground hover:fill-foreground"
			>
				<Icon name="chevron" class={cn('w-4 h-4', expanded ? 'transform rotate-90' : '')} />
			</Button>
		</Collapsible.Trigger>
		<div class="flex flex-row items-center justify-between h-full w-full gap-1 -mt-[1px]">
			<Input
				id={EDITOR_SEARCH_INPUT_ID}
				class="w-full h-7"
				placeholder="Find"
				spellcheck="false"
				bind:value={appState.editorSearchValue}
			/>
			<div class="flex items-center h-full gap-0.5">
				<Tooltip text="Case sensitive" side="bottom">
					<Button
						size="icon"
						variant="ghost"
						scale="md"
						class={cn('h-7 w-7 group', caseSensitive ? 'bg-accent' : '')}
						onclick={() => {
							caseSensitive = !caseSensitive;
						}}
					>
						<ALargeSmall
							class={cn(
								'w-18px] h-[18px] stroke-muted-foreground group-hover:stroke-foreground transition-all stroke-[1.5px]',
								caseSensitive ? 'stroke-foreground' : ''
							)}
						/>
					</Button>
				</Tooltip>
				<Tooltip text="Whole word" side="bottom">
					<Button
						size="icon"
						variant="ghost"
						scale="md"
						class={cn('h-7 w-7 group', wholeWord ? 'bg-accent' : '')}
						onclick={() => {
							wholeWord = !wholeWord;
						}}
					>
						<WholeWord
							class={cn(
								'w-4 h-4 stroke-muted-foreground group-hover:stroke-foreground transition-all stroke-[1.5px]',
								wholeWord ? 'stroke-foreground' : ''
							)}
						/>
					</Button>
				</Tooltip>
				<Tooltip text="Previous" side="bottom" shortcut={{ shift: true, key: 'Enter' }}>
					<Button
						size="icon"
						variant="ghost"
						scale="md"
						class="h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all"
						onclick={() => {
							editor.commands.previousSearchResult();
							goToSearchResult(editor);
						}}
					>
						<Icon name="arrowUp" class="w-4 h-4" />
					</Button>
				</Tooltip>
				<Tooltip text="Next" side="bottom" shortcut={{ key: 'Enter' }}>
					<Button
						size="icon"
						variant="ghost"
						scale="md"
						class="h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all"
						onclick={() => {
							editor.commands.nextSearchResult();
							goToSearchResult(editor);
						}}
					>
						<Icon name="arrowDown" class="w-4 h-4" />
					</Button>
				</Tooltip>
				<Tooltip text="Close" side="bottom">
					<Button
						size="icon"
						variant="ghost"
						scale="md"
						class="h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all"
						onclick={() => {
							close();
						}}
					>
						<Icon name="x" class="w-4 h-4" />
					</Button>
				</Tooltip>
			</div>
		</div>
		<Collapsible.Content class="w-full">
			<div class="flex flex-row items-center justify-between h-full w-full gap-1">
				<Input
					class="w-full h-7"
					placeholder="Replace"
					spellcheck="false"
					bind:value={replaceValue}
				/>
				<div class="flex items-center h-full pr-[90px] gap-0.5">
					<Tooltip text="Replace" side="bottom">
						<Button
							size="icon"
							variant="ghost"
							scale="md"
							class="h-7 w-7 group"
							onclick={() => {
								editor.commands.replace();
								goToSearchResult(editor);
							}}
						>
							<Replace
								class="w-4 h-4 stroke-muted-foreground group-hover:stroke-foreground transition-all stroke-[1.5px]"
							/>
						</Button>
					</Tooltip>
					<Tooltip text="Replace all" side="bottom">
						<Button
							size="icon"
							variant="ghost"
							scale="md"
							class="h-7 w-7 group"
							onclick={() => {
								editor.commands.replaceAll();
								goToSearchResult(editor);
							}}
						>
							<ReplaceAll
								class="w-4 h-4 stroke-muted-foreground group-hover:stroke-foreground transition-all stroke-[1.5px]"
							/>
						</Button>
					</Tooltip>
				</div>
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
</div>
