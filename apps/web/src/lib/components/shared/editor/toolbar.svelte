<script lang="ts">
	import { openNote } from '@/api/notes';
	import Icon from '@/components/shared/icon.svelte';
	import Shortcut from '@/components/shared/shortcut.svelte';
	import Tooltip from '@/components/shared/tooltip.svelte';
	import { SHORTCUTS } from '@/constants';
	import { appState } from '@/store.svelte';
	import { setEditorMode } from '@/utils';
	import Button from '@tactile/ui/components/button/button.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import { FileCode2 } from 'lucide-svelte';

	interface Props {
		hideHistory?: boolean;
		hideParentDirectories?: boolean;
	}

	let { hideHistory = false, hideParentDirectories = false }: Props = $props();

	let historyIndex = $derived(appState.noteHistory.length - 1);

	let breadcrumbs = $derived(
		appState.activeFile?.replace(appState.collection ?? '', '').split('/') ?? []
	);
</script>

<div
	class="sticky gap-2 min-h-10 top-0 px-3 z-50 flex items-center justify-between w-full bg-secondary-background"
>
	<div class="flex gap-1.5 select-none">
		<Tooltip
			text={appState.isPageSidebarOpen ? 'Collapse' : 'Expand'}
			side="bottom"
			shortcut={SHORTCUTS['notes:toggle-sidebar']}
		>
			<Button
				size="icon"
				variant="ghost"
				scale="md"
				class="h-6 w-6 fill-muted-foreground hover:fill-foreground transition-all"
				onclick={() => {
					appState.isPageSidebarOpen = !appState.isPageSidebarOpen;
				}}
			>
				<Shortcut options={SHORTCUTS['notes:toggle-sidebar']} />
				<Icon
					name="sidebarArrow"
					class={cn(
						'w-4 h-4 transform transition-transform',
						appState.isPageSidebarOpen ? 'rotate-180' : ''
					)}
				/>
			</Button>
		</Tooltip>
		{#if !hideHistory}
			<Tooltip text="Previous note" side="bottom" shortcut={SHORTCUTS['notes:history-back']}>
				<Button
					size="icon"
					variant="ghost"
					scale="md"
					class="h-6 w-6 fill-muted-foreground hover:fill-foreground transition-all"
					disabled={!appState.noteHistory?.length ||
						appState.noteHistory?.length === 1 ||
						historyIndex === 0}
					onclick={() => {
						// Decrement the history index
						historyIndex--;

						// Set the active file to the previous note
						openNote(appState.noteHistory[historyIndex], true);
					}}
				>
					<Shortcut
						options={SHORTCUTS['notes:history-back']}
						callback={() => {
							// Make sure the history index is not out of bounds / button is not disabled
							if (
								!appState.noteHistory?.length ||
								appState.noteHistory?.length === 1 ||
								historyIndex === 0
							) {
								return;
							}

							// Decrement the history index
							historyIndex--;

							// Set the active file to the previous note
							openNote(appState.noteHistory[historyIndex], true);
						}}
					/>
					<Icon name="arrowLeft" class="w-4 h-4" />
				</Button>
			</Tooltip>
			<Tooltip text="Next note" side="bottom" shortcut={SHORTCUTS['notes:history-forward']}>
				<Button
					size="icon"
					variant="ghost"
					scale="md"
					class="h-6 w-6 fill-muted-foreground hover:fill-foreground transition-all"
					disabled={!appState.noteHistory?.length ||
						appState.noteHistory?.length === 1 ||
						historyIndex === appState.noteHistory?.length - 1}
					onclick={() => {
						// Increment the history index
						historyIndex++;

						// Set the active file to the next note
						openNote(appState.noteHistory[historyIndex], true);
					}}
				>
					<Shortcut
						options={SHORTCUTS['notes:history-forward']}
						callback={() => {
							// Make sure the history index is not out of bounds / button is not disabled
							if (
								!appState.noteHistory?.length ||
								appState.noteHistory?.length === 1 ||
								historyIndex === appState.noteHistory?.length - 1
							) {
								return;
							}

							// Increment the history index
							historyIndex++;

							// Set the active file to the next note
							openNote(appState.noteHistory[historyIndex], true);
						}}
					/>
					<Icon name="arrowRight" class="w-4 h-4" />
				</Button>
			</Tooltip>
		{:else}
			<div class="w-6"></div>
			<div class="w-6"></div>
		{/if}
	</div>
	<div class="flex gap-1.5">
		<p class="text-xs flex items-center text-muted-foreground fill-muted-foreground">
			{#if !hideParentDirectories}
				{#each breadcrumbs as folder, i (i)}
					{#if i !== 0}
						<Button
							size="sm"
							variant="ghost"
							scale="sm"
							class={cn(
								'h-6 text-[13px] w-fit px-1.5 fill-muted-foreground hover:fill-foreground transition-all font-normal',
								i === breadcrumbs.length - 1 && 'text-foreground font-medium'
							)}
						>
							{folder}
						</Button>
						{#if i !== breadcrumbs.length - 1}
							<Icon name="chevron" class="w-3.5 h-3.5 inline-block" />
						{/if}
					{/if}
				{/each}
			{:else}
				<Button
					size="sm"
					variant="ghost"
					scale="sm"
					class="h-6 text-[13px] w-fit px-1.5 text-foreground transition-all font-medium"
				>
					{appState.activeFile
						?.replace(appState.collection ?? '', '')
						.split('/')
						?.slice(-1)[0] ?? ''}
				</Button>
			{/if}
		</p>
	</div>
	<div class="flex gap-1.5">
		<Tooltip
			text={appState.editorMode === 'edit' ? 'View mode' : 'Edit mode'}
			side="bottom"
			shortcut={SHORTCUTS['editor:toggle-mode']}
		>
			<Button
				size="icon"
				variant="ghost"
				scale="md"
				class="h-6 w-6 fill-muted-foreground hover:fill-foreground transition-all"
				onclick={() => {
					if (appState.editorMode === 'edit') {
						setEditorMode('view');
					} else {
						// view and source both return to edit
						setEditorMode('edit');
					}
				}}
			>
				<Shortcut options={SHORTCUTS['editor:toggle-mode']} />
				<Icon name="editPencil" class={cn('w-4 h-4', appState.editorMode === 'edit' && 'hidden')} />
				<Icon name="glasses" class={cn('w-4 h-4', appState.editorMode !== 'edit' && 'hidden')} />
			</Button>
		</Tooltip>
		<Tooltip text="Source mode" side="bottom" shortcut={SHORTCUTS['editor:source-mode']}>
			<Button
				size="icon"
				variant="ghost"
				scale="md"
				class={cn(
					'h-6 w-6 fill-muted-foreground hover:fill-foreground transition-all',
					appState.editorMode === 'source' && 'fill-foreground bg-accent'
				)}
				onclick={() => {
					setEditorMode(appState.editorMode === 'source' ? 'edit' : 'source');
				}}
			>
				<Shortcut options={SHORTCUTS['editor:source-mode']} />
				<FileCode2 class="w-4 h-4" />
			</Button>
		</Tooltip>
		<Tooltip text="Search" side="bottom" shortcut={SHORTCUTS['editor:search']}>
			<Button
				size="icon"
				variant="ghost"
				scale="md"
				class="h-6 w-6 fill-muted-foreground hover:fill-foreground transition-all disabled:opacity-40"
				disabled={appState.editorMode === 'source'}
				onclick={() => {
					appState.editorSearchActive = !appState.editorSearchActive;
				}}
			>
				<Icon name="searchDocument" class={cn('w-4 h-4')} />
			</Button>
		</Tooltip>
		<Tooltip text="Expand" side="bottom" shortcut={SHORTCUTS['notes:toggle-details']}>
			<Button
				size="icon"
				variant="ghost"
				scale="md"
				class="h-6 w-6 fill-muted-foreground hover:fill-foreground transition-all"
				onclick={() => {
					appState.isNoteDetailSidebarOpen = !appState.isNoteDetailSidebarOpen;
				}}
			>
				<Shortcut options={SHORTCUTS['notes:toggle-details']} />
				<Icon
					name="sidebarArrow"
					class={cn(
						'w-4 h-4 transform transition-transform',
						appState.isNoteDetailSidebarOpen ? '' : 'rotate-180'
					)}
				/>
			</Button>
		</Tooltip>
	</div>
</div>
