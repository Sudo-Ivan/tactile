<script lang="ts">
	import { closeNote } from '../../api/notes';
	import { hasHeader, isMobile } from '../../platform';
	import { appState } from '../../state/app.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import type { Component, Snippet } from 'svelte';
	import Icon from '../shared/icon.svelte';
	import NoteDetails from './details.svelte';

	let { sidebar: Sidebar, children }: { sidebar: Component; children?: Snippet } = $props();
</script>

{#if isMobile()}
	<div class="flex flex-col w-full h-full bg-secondary-background overflow-hidden">
		<!-- File list fills the screen until a note is opened -->
		<div class={cn('h-full', appState.activeFile !== null && 'hidden')}>
			<Sidebar />
		</div>
		<!-- Editor fills the screen once a note is active -->
		<div class={cn('flex h-full w-full flex-col', appState.activeFile === null && 'hidden')}>
			<div class="flex h-12 shrink-0 items-center gap-1 border-b bg-secondary-background px-2">
				<button
					class="flex h-10 items-center gap-1.5 rounded-md px-2 fill-muted-foreground text-sm text-muted-foreground active:fill-foreground active:text-foreground"
					onclick={() => {
						closeNote();
					}}
				>
					<Icon name="arrowLeft" class="w-4 h-4" />
					Back
				</button>
			</div>
			<div class="h-full w-full overflow-y-auto">
				{@render children?.()}
			</div>
		</div>
	</div>
{:else}
	<div
		class={cn(
			'flex flex-col w-full h-[calc(100vh-4.5rem)] bg-secondary-background ml-12 overflow-hidden',
			!hasHeader() && 'h-[100vh]'
		)}
	>
		<Sidebar />
		<div
			class="h-full overflow-y-auto"
			style={`
					margin-left: ${appState.isPageSidebarOpen ? appState.pageSidebarWidth : 0}px;
					margin-right: ${appState.isNoteDetailSidebarOpen ? appState.noteDetailSidebarWidth : 0}px;
					transition: ${
						appState.resizingPageSidebar || appState.resizingNoteDetailSidebar
							? 'none'
							: 'margin-left 300ms, margin-right 300ms'
					}
			`}
		>
			{@render children?.()}
		</div>
		<NoteDetails />
	</div>
{/if}
