<script lang="ts">
	import { SHORTCUTS } from '../../constants';
	import { isMobile } from '../../platform';
	import { appState } from '../../state/app.svelte';
	import type { ShortcutParams } from '../../types';
	import { dispatchShortcut, shortcutToString } from '../../utils/keyboard';
	import { cn } from '@tactile/ui/lib/utils';
	import Editor from '../shared/editor/editor.svelte';
	import EditorInlineTitle from '../shared/editor/inline-title.svelte';
	import EditorSearch from '../shared/editor/search.svelte';
	import SourceEditor from '../shared/editor/source.svelte';
	import EditorToolbar from '../shared/editor/toolbar.svelte';
	import Shortcut from '../shared/shortcut.svelte';

	// Shared editor page shell for the notes/daily/tasks routes on both apps.
	// compactToolbar hides history + breadcrumb segments (daily/tasks);
	// sourceMode enables the raw-markdown editor pane (notes only).
	let {
		emptyLabel,
		createLabel,
		createShortcut,
		onCreate,
		preCheckRegex,
		compactToolbar = false,
		sourceMode = false
	}: {
		emptyLabel: string;
		createLabel?: string;
		createShortcut?: ShortcutParams;
		onCreate?: () => void;
		preCheckRegex?: RegExp;
		compactToolbar?: boolean;
		sourceMode?: boolean;
	} = $props();
</script>

<div
	class={cn(
		'relative flex flex-col w-full h-full items-start bg-secondary-background overflow-y-auto scroll-p-20',
		isMobile() ? 'min-h-full' : 'min-h-[calc(100vh-4.5rem)]'
	)}
>
	{#if appState.collectionSettings.editor.show_toolbar}
		<EditorToolbar hideHistory={compactToolbar} hideParentDirectories={compactToolbar} />
	{/if}

	<div
		class={cn(
			'flex flex-col items-center justify-center w-full h-full -mt-10',
			appState.activeFile !== null && 'hidden'
		)}
	>
		<!-- Row with following options: Open collection, create note -->
		<div class="flex flex-col items-center gap-2">
			<p class="text-secondary-foreground/85">{emptyLabel}</p>
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
				{#if createLabel && onCreate}
					<button
						class="text-sm gap-1.5 flex text-muted-foreground hover:text-secondary-foreground transition-colors items-center justify-center"
						onclick={onCreate}
					>
						{#if createShortcut}
							<Shortcut options={createShortcut} />
						{/if}
						<span
							class="pointer-events-none inline-flex h-[18px] pl-1.5 tracking-widest select-none items-center gap-1 rounded bg-secondary px-1 font-mono text-muted-foreground opacity-100"
						>
							{shortcutToString(createShortcut ?? SHORTCUTS['notes:create'])}
						</span>
						{createLabel}
					</button>
				{/if}
			</div>
		</div>
	</div>
	<div class={cn('w-full h-full', appState.activeFile === null && 'hidden')}>
		{#if !sourceMode || appState.editorMode !== 'source'}
			<EditorSearch />
		{/if}
		<EditorInlineTitle {preCheckRegex} />
		{#if sourceMode}
			<div class={cn(appState.editorMode === 'source' && 'hidden')}>
				<Editor />
			</div>
			{#if appState.editorMode === 'source'}
				<SourceEditor />
			{/if}
		{:else}
			<Editor />
		{/if}
	</div>
</div>
