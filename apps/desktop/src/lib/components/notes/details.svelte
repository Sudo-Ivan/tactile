<script lang="ts">
	import { sidebarResize } from '@/actions/sidebar-resize';
	import { getNoteMetadataParams } from '@/api/notes';
	import Icon from '@/components/shared/icon.svelte';
	import Tooltip from '@/components/shared/tooltip.svelte';
	import { appState } from '@/store.svelte';
	import type { NoteMetadataParams } from '@/types';
	import { Button } from '@tactile/ui/components/button';
	import { cn } from '@tactile/ui/lib/utils';
	import type { NodePos } from '@tiptap/core';
	import HistoryPanel from './history-panel.svelte';
	import MetadataPanel from './metadata-panel.svelte';
	import TocPanel from './toc-panel.svelte';

	let tab = $derived(appState.noteDetailTab);

	const setTab = (value: 'metadata' | 'toc' | 'history') => {
		appState.noteDetailTab = value;
	};
	let nodeHeadings = $state<NodePos[] | null>(null);
	let activeNoteMetadataParams = $state<NoteMetadataParams | null>(null);

	// Watch for active file changes
	$effect(() => {
		const filePath = appState.activeFile;
		void (async () => {
			if (filePath) {
				nodeHeadings = appState.editor.instance.$nodes('heading');
				activeNoteMetadataParams = await getNoteMetadataParams(filePath);
			} else {
				nodeHeadings = null;
				activeNoteMetadataParams = null;
			}
		})();
	});

	// Subscribe to save events
	$effect(() => {
		return appState.editor.subscribeToSaveEvents(async () => {
			if (tab === 'metadata') {
				activeNoteMetadataParams = await getNoteMetadataParams(appState.activeFile!);
			} else if (tab === 'toc') {
				nodeHeadings = appState.editor.instance.$nodes('heading');
			}
		});
	});
</script>

<div
	class={cn(
		'fixed right-0 flex flex-col justify-start items-center bg-background overflow-y-auto transform transition-transform duration-300',
		!appState.isNoteDetailSidebarOpen && 'translate-x-full',
		appState.platform === 'darwin' ? 'h-[calc(100vh-4.5rem)]' : 'h-[calc(100vh-2.25rem)]'
	)}
	style={`width: ${appState.noteDetailSidebarWidth}px`}
>
	<!-- Drag border -->
	<div
		class="h-full w-1 border-l cursor-col-resize absolute top-0 left-0 z-10 hover:bg-foreground/10 hover:delay-75 transition-all duration-200 active:bg-foreground/20 active:!cursor-col-resize"
		use:sidebarResize={'note-detail'}
		role="presentation"
	></div>

	<!-- Controls -->
	<div
		class="relative top-0 flex flex-row h-10 w-full border-b bg-background overflow-hidden items-center justify-center px-3.5 gap-2 shrink-0 transform transition-all translate-y-0"
	>
		<Tooltip text="Metadata" side="bottom">
			<Button
				size="icon"
				variant="ghost"
				scale="md"
				class={cn(
					'h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all',
					tab === 'metadata' && 'fill-foreground bg-accent'
				)}
				onclick={() => {
					setTab('metadata');
				}}
			>
				<Icon name="identityGhost" class="w-[18px] h-[18px]" />
			</Button>
		</Tooltip>
		<Tooltip text="Table of Contents" side="bottom">
			<Button
				size="icon"
				variant="ghost"
				scale="md"
				class={cn(
					'h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all',
					tab === 'toc' && 'fill-foreground bg-accent'
				)}
				onclick={() => {
					setTab('toc');
				}}
			>
				<Icon name="layer" class="w-[16px] h-[16px]" />
			</Button>
		</Tooltip>
		<Tooltip text="Version history" side="bottom">
			<Button
				size="icon"
				variant="ghost"
				scale="md"
				class={cn(
					'h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all',
					tab === 'history' && 'fill-foreground bg-accent'
				)}
				onclick={() => {
					setTab('history');
				}}
			>
				<Icon name="reload" class="w-[16px] h-[16px]" />
			</Button>
		</Tooltip>
	</div>

	<!-- Metadata -->
	{#if activeNoteMetadataParams && tab === 'metadata'}
		<MetadataPanel metadata={activeNoteMetadataParams} />
	{:else if tab === 'toc' && nodeHeadings && nodeHeadings.length > 0}
		<TocPanel headings={nodeHeadings} />
	{:else if tab === 'history'}
		<HistoryPanel />
	{:else}
		<div class="flex flex-col items-center justify-center w-full h-full">
			<p class="text-[13px] text-muted-foreground">
				{tab === 'metadata' ? 'No metadata available' : 'No headings found'}
			</p>
		</div>
	{/if}
</div>
