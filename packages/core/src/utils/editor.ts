import type { Editor } from '@tiptap/core';

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
	// searchAndReplace storage is declared by each app's searchAndReplace
	// extension; cast to the surface used here.
	const { results, resultIndex } = (editor.storage as unknown as Record<string, unknown>)
		.searchAndReplace as {
		results: { from: number; to: number }[];
		resultIndex: number;
	};
	const position = results[index ?? resultIndex];

	if (!position) return;

	editor.commands.setTextSelection(position);
	scrollEditorSelectionIntoView(editor);
}

// Get the text of the current editor selection
export function getEditorSelectionText(editor: Editor) {
	const { from, to } = editor.state.selection;
	return editor.state.doc.textBetween(from, to);
}
