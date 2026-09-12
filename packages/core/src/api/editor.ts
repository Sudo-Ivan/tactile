import { EditorState } from '@tiptap/pm/state';
import { appState } from '../state/app.svelte';

export type EditorMode = 'edit' | 'view' | 'source';

/**
 * Resets the editors document title, updating the editor state, and focusing on the
 * first element after the heading.
 */
export function setEditorContent(content: string) {
	const editor = appState.editor.instance;
	if (!editor) return;

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

// Switch between the rich editor, read-only view and raw markdown source.
// Entering source mode serializes the current document; leaving it parses the
// buffer back, so edits made in either mode carry over.
export function setEditorMode(next: EditorMode) {
	const mode = appState.editorMode;
	if (next === mode) return;

	const editor = appState.editor.instance;

	if (mode === 'source') {
		// Parse the raw buffer back into the document.
		setEditorContent(appState.sourceContent);
	}

	if (next === 'source') {
		// Capture the document exactly as markdown for the source buffer.
		appState.sourceContent = editor?.storage.markdown.getMarkdown() ?? '';
		editor?.setEditable(false);
		// The tiptap find/replace panel has no effect on the source buffer.
		appState.editorSearchActive = false;
	} else {
		editor?.setEditable(next === 'edit');
	}

	appState.editorMode = next;
}

// Replace the raw markdown buffer shown in source mode. Writes go through
// here so the source buffer stays a single-writer piece of domain state.
export function setSourceContent(content: string) {
	appState.sourceContent = content;
}
