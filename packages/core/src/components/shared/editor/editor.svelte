<script lang="ts">
	import { importAttachments } from '../../../api/attachments';
	import { openWikilink } from '../../../api/links';
	import { saveNote } from '../../../api/notes';
	import { SHORTCUTS } from '../../../constants';
	import { isMobile } from '../../../platform';
	import { appState } from '../../../state/app.svelte';
	import { Editor } from '@tiptap/core';
	import { FileHandler } from '@tiptap/extension-file-handler';
	import 'katex/dist/katex.min.css';
	import { onDestroy, onMount } from 'svelte';
	import Shortcut from '../shortcut.svelte';
	import { buildEditorExtensions } from './extensions';

	let element: HTMLDivElement;
	let tiptapEditor = $state<Editor>();
	let timeout: ReturnType<typeof setTimeout>;

	async function insertAttachments(editor: Editor, files: File[], pos?: number) {
		if (!editor.isEditable) return;
		const imported = await importAttachments(files);
		if (imported.length === 0) return;
		const content = imported.map((a) => ({
			type: 'image',
			attrs: { src: a.src, alt: a.name }
		}));
		const chain = editor.chain().focus();
		if (pos !== undefined) {
			chain.insertContentAt(pos, content);
		} else {
			chain.insertContent(content);
		}
		chain.run();
	}

	onMount(() => {
		tiptapEditor = new Editor({
			element: element,
			extensions: [
				...buildEditorExtensions(),
				FileHandler.configure({
					consumePasteEvent: true,
					onPaste: (editor, files) => {
						void insertAttachments(editor, files);
					},
					onDrop: (editor, files, pos) => {
						void insertAttachments(editor, files, pos);
					}
				})
			],
			editorProps: {
				attributes: {
					class: 'prose prose-theme mx-auto focus:outline-none min-h-full pb-6 select-text'
				},
				handleClick: (_view, _pos, event) => {
					const link = (event.target as HTMLElement).closest?.('[data-wikilink]');
					if (!link) return false;
					event.preventDefault();
					void openWikilink(link.getAttribute('data-target') ?? '');
					return true;
				}
			},
			onCreate: ({ editor }) => {
				// Expose the instance immediately so openNote/setEditorContent
				// work before the first user transaction.
				appState.editor.setInstance(editor);
			},
			onTransaction: () => {
				// force re-render so `editor.isActive` works as expected
				tiptapEditor = tiptapEditor;
				appState.editor.setInstance(tiptapEditor!);
			},
			onUpdate: async () => {
				const path = appState.activeFile;
				if (!path) return;
				const generation = appState.editor.markDirty(path);

				// If timeout before 500ms, clear it
				if (timeout) {
					clearTimeout(timeout);
				}

				// Set timeout to update the store
				timeout = setTimeout(async () => {
					if (
						appState.collectionSettings.editor.auto_save &&
						appState.editor.dirtyPath === path &&
						appState.activeFile === path
					) {
						saveNote(path)
							.then(() => {
								appState.editor.clearDirty(generation);
								appState.editor.notifySaveEvent();
							})
							.catch((error) => {
								console.error('Error saving note:', error);
							});
					}
				}, appState.collectionSettings.editor.auto_save_debounce);
			}
		});
	});

	onDestroy(() => {
		clearTimeout(timeout);
		if (appState.editor.instance === tiptapEditor) {
			appState.editor.setInstance(undefined);
		}
		tiptapEditor?.destroy();
	});
</script>

<!-- >96px is required to hide scrollbar in normal size -->
<div
	bind:this={element}
	spellcheck={appState.collectionSettings.editor.spell_check}
	class="w-full h-[calc(100%-97px)]"
	class:px-5={isMobile()}
	class:px-8={!isMobile()}
>
	<Shortcut options={SHORTCUTS['note:save']} callback={() => saveNote(appState.activeFile ?? '')} />
	<Shortcut
		options={SHORTCUTS['note:copy-path']}
		callback={() => navigator.clipboard.writeText(appState.activeFile ?? '')}
	/>
</div>

<style>
	div :global(ul[data-type='taskList']) {
		list-style: none;
		padding: 0;
		user-select: none;
	}

	div :global(ul[data-type='taskList'] li > label input[type='checkbox']) {
		-webkit-appearance: none;
		appearance: none;
		transition: 120ms all ease-in-out;
		margin: 0;
		cursor: pointer;
		width: 1.2em;
		height: 1.2em;
		position: relative;
		top: 5px;
		border: 1px solid hsl(var(--border) / 1);
		display: grid;
		place-content: center;

		&:hover {
			background-color: hsl(var(--accent) / 1);
			border: 1px solid hsl(var(--foreground) / 0.6);
		}

		&::before {
			content: '';
			width: 0.65em;
			height: 0.65em;
			transform: scale(0);
			transition: 120ms transform ease-in-out;
			box-shadow: inset 1em 1em;
			transform-origin: center;
			clip-path: polygon(10% 44%, 0 65%, 40% 100%, 100% 10%, 80% 0%, 43% 62%);
		}

		&:checked::before {
			transform: scale(1);
		}
	}

	div :global(ul[data-type='taskList'] li[data-checked='true'] > div > p) {
		color: hsl(var(--foreground) / 0.6);
		text-decoration: line-through;
		text-decoration-thickness: 1px;
	}

	div :global(ul[data-type='taskList'] li > label) {
		margin-right: 0.2rem;
		user-select: none;
	}

	div :global(.search-result) {
		background-color: hsl(var(--muted));
	}

	div :global(.search-result-current) {
		background-color: rgba(248, 160, 30, 0.5);
	}

	/* ---- code blocks: lowlight theme on app CSS vars ---- */

	div :global(.tt-code-block) {
		position: relative;
	}

	div :global(.tt-code-lang) {
		position: absolute;
		top: 0.35rem;
		right: 0.6rem;
		font-size: 0.7rem;
		font-family: ui-monospace, monospace;
		color: hsl(var(--muted-foreground) / 0.7);
		user-select: none;
		pointer-events: none;
		z-index: 1;
	}

	div :global(.tt-code-block .hljs-comment),
	div :global(.tt-code-block .hljs-quote) {
		color: hsl(var(--muted-foreground) / 0.7);
		font-style: italic;
	}
	div :global(.tt-code-block .hljs-keyword),
	div :global(.tt-code-block .hljs-selector-tag),
	div :global(.tt-code-block .hljs-tag) {
		color: hsl(var(--primary));
	}
	div :global(.tt-code-block .hljs-string),
	div :global(.tt-code-block .hljs-regexp),
	div :global(.tt-code-block .hljs-addition) {
		color: hsl(140 40% 45%);
	}
	div :global(.tt-code-block .hljs-number),
	div :global(.tt-code-block .hljs-literal) {
		color: hsl(35 80% 50%);
	}
	div :global(.tt-code-block .hljs-title),
	div :global(.tt-code-block .hljs-title.function_),
	div :global(.tt-code-block .hljs-title.class_) {
		color: hsl(210 80% 60%);
	}
	div :global(.tt-code-block .hljs-attr),
	div :global(.tt-code-block .hljs-attribute),
	div :global(.tt-code-block .hljs-variable),
	div :global(.tt-code-block .hljs-template-variable) {
		color: hsl(280 60% 60%);
	}
	div :global(.tt-code-block .hljs-built_in),
	div :global(.tt-code-block .hljs-type) {
		color: hsl(190 70% 50%);
	}
	div :global(.tt-code-block .hljs-deletion) {
		color: hsl(var(--destructive));
	}
	div :global(.tt-code-block .hljs-meta),
	div :global(.tt-code-block .hljs-symbol) {
		color: hsl(var(--muted-foreground));
	}

	/* ---- mermaid ---- */

	div :global(.tt-mermaid-preview) {
		display: flex;
		justify-content: center;
		padding: 0.75rem;
		margin: 0 0 1rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		background: hsl(var(--background));
		overflow-x: auto;
	}

	div :global(.tt-mermaid-preview svg) {
		max-width: 100%;
		height: auto;
	}

	div :global(.tt-mermaid-error) {
		color: hsl(var(--destructive));
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		white-space: pre-wrap;
	}

	/* ---- wikilinks ---- */

	div :global(.tt-wikilink) {
		color: hsl(var(--primary));
		text-decoration: none;
		border-bottom: 1px dashed hsl(var(--primary) / 0.5);
		cursor: pointer;
		transition: all 120ms ease-in-out;
	}

	div :global(.tt-wikilink:hover) {
		border-bottom-style: solid;
		color: hsl(var(--primary) / 0.8);
	}

	/* ---- attachments ---- */

	div :global(.tt-attachment) {
		margin: 0.5rem 0;
		user-select: none;
	}

	div :global(.tt-attachment img) {
		display: block;
		max-width: 100%;
		border-radius: 0.5rem;
		border: 1px solid hsl(var(--border));
	}

	div :global(.tt-media-frame) {
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		background: hsl(var(--secondary));
		overflow: hidden;
	}

	div :global(.tt-media-head) {
		padding: 0.3rem 0.6rem;
		font-size: 0.72rem;
		font-family: ui-monospace, monospace;
		color: hsl(var(--muted-foreground));
		border-bottom: 1px solid hsl(var(--border));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	div :global(.tt-media-frame video) {
		display: block;
		width: 100%;
		max-height: 480px;
		background: black;
	}

	div :global(.tt-media-frame audio) {
		display: block;
		width: 100%;
		height: 2.5rem;
	}

	div :global(.tt-file-card) {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.9rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		background: hsl(var(--secondary));
		color: hsl(var(--foreground));
		font-size: 0.85rem;
		text-decoration: none;
		transition: all 120ms ease-in-out;
	}

	div :global(.tt-file-card:hover) {
		background: hsl(var(--accent));
	}

	div :global(.tt-file-icon) {
		display: inline-flex;
		color: hsl(var(--muted-foreground));
	}

	div :global(.tt-attachment-missing) {
		display: inline-block;
		padding: 0.35rem 0.7rem;
		border: 1px dashed hsl(var(--destructive) / 0.6);
		border-radius: 0.5rem;
		color: hsl(var(--destructive));
		font-size: 0.8rem;
		font-family: ui-monospace, monospace;
	}

	/* ---- math ---- */

	div :global([data-type='block-math']) {
		padding: 0.75rem;
		margin: 0.5rem 0;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		background: hsl(var(--background));
		overflow-x: auto;
		text-align: center;
	}

	div :global([data-type='inline-math']) {
		padding: 0 0.15em;
	}

	div :global(.katex) {
		color: hsl(var(--foreground));
	}
</style>
