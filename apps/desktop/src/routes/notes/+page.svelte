<script lang="ts">
	import EditorInlineTitle from '$lib/components/shared/editor/inline-title.svelte';
	import EditorSearch from '$lib/components/shared/editor/search.svelte';
	import EditorToolbar from '$lib/components/shared/editor/toolbar.svelte';
	import { createNote } from '@/api/notes';
	import Editor from '@/components/shared/editor/editor.svelte';
	import { SHORTCUTS } from '@/constants';
	import { isMobile } from '@/platform.svelte';
	import { appState } from '@/store.svelte';
	import { dispatchShortcut, shortcutToString } from '@/utils/keyboard';
	import { cn } from '@tactile/ui/lib/utils';
</script>

<div
	class={cn(
		'relative flex flex-col w-full h-full items-start bg-secondary-background overflow-y-auto scroll-p-20',
		isMobile ? 'min-h-full' : 'min-h-[calc(100vh-4.5rem)]'
	)}
>
	{#if appState.collectionSettings.editor.show_toolbar}
		<EditorToolbar />
	{/if}

	<div
		class={cn(
			'flex flex-col items-center justify-center w-full h-full -mt-10',
			appState.activeFile !== null && 'hidden'
		)}
	>
		<!-- Row with following options: Open collection, create note -->
		<div class="flex flex-col items-center gap-2">
			<p class="text-secondary-foreground/85">Select a note to start editing</p>
			<div class="flex gap-5">
				<button
					class="text-sm gap-1.5 flex text-muted-foreground hover:text-secondary-foreground transition-colors items-center justify-center"
					onclick={() => {
						dispatchShortcut('o');
					}}
				>
					<span
						class="pointer-events-none inline-flex h-[18px] pl-1.5 tracking-widest select-none items-center gap-1 rounded bg-secondary px-1 font-mono text-muted-foreground opacity-100"
					>
						{shortcutToString(SHORTCUTS['app:open-collection'])}
					</span>
					Open Collection</button
				>
				<button
					class="text-sm gap-1.5 flex text-muted-foreground hover:text-secondary-foreground transition-colors items-center justify-center"
					onclick={() => {
						createNote(appState.collection!);
					}}
				>
					<span
						class="pointer-events-none inline-flex h-[18px] pl-1.5 tracking-widest select-none items-center gap-1 rounded bg-secondary px-1 font-mono text-muted-foreground opacity-100"
					>
						{shortcutToString(SHORTCUTS['notes:create'])}
					</span>
					Create note
				</button>
			</div>
		</div>
	</div>
	<div class={cn('w-full h-full', appState.activeFile === null && 'hidden')}>
		<EditorSearch />
		<EditorInlineTitle />
		<Editor />
	</div>
</div>
