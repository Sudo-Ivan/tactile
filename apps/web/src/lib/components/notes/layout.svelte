<script lang="ts">
	import { appState } from '@/store.svelte';
	import type { Component, Snippet } from 'svelte';
	import NoteDetails from './details.svelte';

	interface Props {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		sidebar: Component<any>;
		children?: Snippet;
	}

	let { sidebar: Sidebar, children }: Props = $props();
</script>

<div
	class="flex flex-col w-full h-[calc(100vh-4.5rem)] bg-secondary-background ml-12 overflow-hidden"
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
