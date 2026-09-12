<script lang="ts">
	import { appState } from '@/store.svelte';
	import { cn } from '@/utils';
	import type { Component, Snippet } from 'svelte';
	import NoteDetails from './details.svelte';

	let { sidebar: Sidebar, children }: { sidebar: Component; children?: Snippet } = $props();
</script>

<div
	class={cn(
		'flex flex-col w-full h-[calc(100vh-4.5rem)] bg-secondary-background ml-12 overflow-hidden',
		appState.platform !== 'darwin' && 'h-[100vh]'
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
