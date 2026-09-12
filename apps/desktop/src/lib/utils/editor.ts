import type { Editor } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import { appState } from '../store.svelte';

/**
 * Resets the editors document title, updating the editor state, and focusing on the
 * first element after the heading.
 */
export function setEditorContent(content: string) {
	const editor = appState.editor.instance;

	// Set content of the editor
	editor.commands.setContent(content);

	// Update the editor state
	const newEditorState = EditorState.create({
		doc: editor.state.doc,
		plugins: editor.state.plugins,
		schema: editor.state.schema
	});
	editor.view.updateState(newEditorState);

	// Focus first line
	editor.chain().focus().run();
}

// Scroll the current editor selection into view if it is outside the viewport
export function scrollEditorSelectionIntoView(editor: Editor) {
	const { node } = editor.view.domAtPos(editor.state.selection.anchor);
	if (node instanceof HTMLElement) {
		const rect = node.getBoundingClientRect();
		const isAboveView = rect.top < 0;
		const isBelowView = rect.bottom > window.innerHeight;

		if (isAboveView || isBelowView) {
			// Smooth scroll doesn't seem to work well from bottom to top
			const behavior = isAboveView ? 'auto' : 'smooth';
			node.scrollIntoView({ behavior, block: 'center' });
		}
	}
}

// Select the search result at the given index, or the current result index
export function goToSearchResult(editor: Editor, index?: number) {
	const { results, resultIndex } = editor.storage.searchAndReplace;
	const position: {
		from: number;
		to: number;
	} = results[index ?? resultIndex];

	if (!position) return;

	editor.commands.setTextSelection(position);
	scrollEditorSelectionIntoView(editor);
}

// Get the text of the current editor selection
export function getEditorSelectionText(editor: Editor) {
	const { from, to } = editor.state.selection;
	return editor.state.doc.textBetween(from, to);
}
