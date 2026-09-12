<script lang="ts">
	import { appState } from '../../state/app.svelte';
	import { calculateTocItems } from '../../utils/toc';
	import { scrollEditorSelectionIntoView } from '../../utils/editor';
	import type { NodePos } from '@tiptap/core';

	let { headings }: { headings: NodePos[] } = $props();

	// Calculate TOC items
	const tocItems = $derived(calculateTocItems(headings));

	function openHeading(index: number) {
		const editor = appState.editor.instance;
		if (!editor) return;

		// Set cursor focus to the heading
		editor
			.chain()
			.focus('end', { scrollIntoView: false })
			.setTextSelection(headings[index].pos)
			.run();

		scrollEditorSelectionIntoView(editor);
	}
</script>

<div class="w-full h-full overflow-auto">
	<!-- TOC -->
	<div class="flex flex-col gap-1.5 items-start w-full h-full overflow-auto px-4 py-2.5">
		{#each tocItems as item, index (index)}
			<button
				type="button"
				class="flex flex-row items-center justify-between w-full min-h-[24px] h-6 text-[13px] truncate font-normal text-muted-foreground hover:text-primary transition-all"
				style="padding-left: {item.indent}rem"
				onclick={() => openHeading(index)}
			>
				<p class="truncate">{item.text}</p>
			</button>
		{/each}
	</div>
</div>
