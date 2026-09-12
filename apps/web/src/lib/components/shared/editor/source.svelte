<script lang="ts">
	import { saveNote } from '@/api/notes';
	import { appState } from '@/store.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import { onDestroy } from 'svelte';

	let textarea = $state<HTMLTextAreaElement>();
	let gutter = $state<HTMLDivElement>();
	let saveTimeout: ReturnType<typeof setTimeout> | undefined;

	let lineNumbers = $derived(
		Array.from({ length: appState.sourceContent.split('\n').length }, (v, i) => i + 1)
	);
	let showGutter = $derived(appState.collectionSettings.editor.show_line_numbers);

	function scheduleSave() {
		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => {
			if (appState.collectionSettings.editor.auto_save && appState.activeFile) {
				saveNote(appState.activeFile)
					.then(() => appState.editor.notifySaveEvent())
					.catch((error) => console.error('Error saving note:', error));
			}
		}, appState.collectionSettings.editor.auto_save_debounce);
	}

	function insertAtCursor(insert: string) {
		const el = textarea;
		if (!el) return;
		const start = el.selectionStart;
		const end = el.selectionEnd;
		appState.sourceContent =
			appState.sourceContent.slice(0, start) + insert + appState.sourceContent.slice(end);
		requestAnimationFrame(() => {
			el.selectionStart = el.selectionEnd = start + insert.length;
		});
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Tab') {
			e.preventDefault();
			insertAtCursor('  ');
			scheduleSave();
		} else if (e.key === 'Enter') {
			// Continue the current line's indentation and list markers.
			const el = textarea;
			if (!el || el.selectionStart !== el.selectionEnd) return;
			const before = appState.sourceContent.slice(0, el.selectionStart);
			const lineStart = before.lastIndexOf('\n') + 1;
			const line = before.slice(lineStart);
			const match = line.match(/^(\s*(?:[-*+] |\d+\. |\[ \] |\[x\] |\[X\] |> )*)/);
			const indent = match?.[1] ?? '';
			if (indent) {
				e.preventDefault();
				insertAtCursor('\n' + indent);
				scheduleSave();
			}
		}
	}

	function syncScroll() {
		if (gutter && textarea) gutter.scrollTop = textarea.scrollTop;
	}

	$effect(() => {
		// Focus the textarea whenever source mode mounts or a note is opened.
		if (appState.activeFile) textarea?.focus();
	});

	onDestroy(() => clearTimeout(saveTimeout));
</script>

<div class="w-full h-[calc(100%-97px)] px-8">
	<div class="flex w-fit max-w-[655px] h-full mx-auto min-w-0">
		{#if showGutter}
			<div
				bind:this={gutter}
				class="select-none overflow-hidden text-right pr-3 mr-3 border-r border-border/50 text-muted-foreground/50 shrink-0 font-mono text-sm leading-5 pt-px"
				aria-hidden="true"
			>
				{#each lineNumbers as n (n)}
					<div>{n}</div>
				{/each}
			</div>
		{/if}
		<textarea
			bind:this={textarea}
			bind:value={appState.sourceContent}
			oninput={scheduleSave}
			onkeydown={handleKeydown}
			onscroll={syncScroll}
			spellcheck={appState.collectionSettings.editor.spell_check}
			{...{ autocorrect: appState.collectionSettings.editor.auto_correct ? 'on' : 'off' }}
			class={cn(
				'w-[655px] h-full resize-none bg-transparent font-mono text-sm leading-5',
				'text-foreground/90 focus:outline-none placeholder:text-muted-foreground/60',
				'whitespace-pre overflow-auto pb-6'
			)}
			placeholder="Start typing markdown..."></textarea>
	</div>
</div>
