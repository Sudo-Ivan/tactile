<script lang="ts">
	import { renameNote } from '@/api/notes';
	import { appState } from '@/store.svelte';
	import { cn } from '@/utils';
	import { untrack } from 'svelte';

	interface Props {
		preCheckRegex?: RegExp;
	}

	let { preCheckRegex }: Props = $props();

	let value = $state('');

	// Handle keydown for enter key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			appState.editor.instance?.chain().focus().run();
		}
	}

	// Rename handler on input blur
	async function handleBlur() {
		const activeFile = appState.activeFile;
		if (!activeFile) return;

		const currentName = activeFile.split('/').pop()!.split('.').slice(0, -1).join('.');

		// Make sure file name is in date format year-month-day, else return
		if (preCheckRegex && !preCheckRegex.test(value)) {
			value = currentName;
		}

		if (value !== currentName && value.trim() !== '') {
			// Rename note
			try {
				await renameNote(activeFile, value);
			} catch {
				value = currentName;
			}
		}

		if (value.trim() === '') {
			value = currentName;
		}

		// Remove last extension
		if (value.includes('.')) {
			value = value.split('.').slice(0, -1).join('.');
		}

		// Remove invalid characters
		value = value.replace(/[/\\?%*:|"<>]/g, '');
	}

	$effect(() => {
		const notePath = appState.activeFile;
		untrack(() => {
			// Set file name as value, remove extension
			value = notePath ? notePath.split('/').pop()!.split('.').slice(0, -1).join('.') : '';
		});
	});
</script>

<div
	class={cn(
		'flex items-center w-full h-fit px-8 pb-2.5',
		!appState.collectionSettings.editor.show_toolbar && 'mt-5'
	)}
>
	{#if appState.collectionSettings.editor.show_inline_title}
		<input
			id="inline-title-input"
			type="text"
			autocomplete="off"
			autocorrect="off"
			disabled={appState.editorMode !== 'edit'}
			class={cn(
				'w-[655px] prose font-bold text-4xl text-foreground mx-auto bg-transparent focus:outline-none',
				// Safari / Webkit for some reason has a smaller editor width so we need to adjust
				/^((?!chrome|android).)*safari/i.test(navigator.userAgent) && 'w-[635px]'
			)}
			onkeydown={handleKeydown}
			onblur={handleBlur}
			bind:value
		/>
	{/if}
</div>
