<script lang="ts">
	import { renameNote } from '../../../api/notes';
	import { INLINE_TITLE_INPUT_ID } from '../../../constants';
	import { isMobile } from '../../../platform';
	import { appState } from '../../../state/app.svelte';
	import { cn } from '@tactile/ui/lib/utils';

	let { preCheckRegex }: { preCheckRegex?: RegExp } = $props();

	let value = $state('');

	// Handle keydown for enter key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			appState.editor.instance?.chain().focus().run();
		}
	}

	// Current file name without the extension
	function fileName() {
		return appState.activeFile!.split('/').pop()!.split('.').slice(0, -1).join('.');
	}

	// Rename handler on input blur
	async function handleBlur() {
		if (!appState.activeFile) return;

		// Make sure file name is in date format year-month-day, else return
		if (preCheckRegex && !preCheckRegex.test(value)) {
			value = fileName();
		}

		if (value !== fileName() && value.trim() !== '') {
			// Rename note
			try {
				await renameNote(appState.activeFile, value);
			} catch {
				value = fileName();
			}
		}

		if (value.trim() === '') {
			value = fileName();
		}

		// Remove last extension
		if (value.includes('.')) {
			value = value.split('.').slice(0, -1).join('.');
		}

		// Remove invalid characters
		value = value.replace(/[/\\?%*:|"<>]/g, '');
	}

	// Set file name as value when the active file changes, remove extension
	$effect(() => {
		const notePath = appState.activeFile;
		value = notePath ? notePath.split('/').pop()!.split('.').slice(0, -1).join('.') : '';
	});
</script>

<div
	class={cn(
		'flex items-center w-full h-fit pb-2.5',
		isMobile() ? 'px-5' : 'px-8',
		!appState.collectionSettings.editor.show_toolbar && 'mt-5'
	)}
>
	{#if appState.collectionSettings.editor.show_inline_title}
		<input
			id={INLINE_TITLE_INPUT_ID}
			type="text"
			autocomplete="off"
			autocorrect="off"
			disabled={appState.editorMode !== 'edit'}
			class={cn(
				'prose font-bold text-4xl text-foreground mx-auto bg-transparent focus:outline-none',
				isMobile() ? 'w-full' : 'w-[655px]',
				// Safari / Webkit for some reason has a smaller editor width so we need to adjust
				!isMobile() && /^((?!chrome|android).)*safari/i.test(navigator.userAgent) && 'w-[635px]'
			)}
			onkeydown={handleKeydown}
			onblur={handleBlur}
			bind:value
		/>
	{/if}
</div>
