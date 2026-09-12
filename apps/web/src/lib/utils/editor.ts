import { appState } from '@/store.svelte';
import { EditorState } from '@tiptap/pm/state';

/**
 * Resets the editors document title, updating the editor state, and focusing on the
 * first element after the heading.
 */
export function setEditorContent(content: string) {
	const instance = appState.editor.instance;
	if (!instance) return;

	// Set content of the editor
	instance.commands.setContent(content);

	// Update the editor state
	const newEditorState = EditorState.create({
		doc: instance.state.doc,
		plugins: instance.state.plugins,
		schema: instance.state.schema
	});
	instance.view.updateState(newEditorState);

	// Focus first line
	instance.chain().focus().run();
}

export type EditorMode = 'edit' | 'view' | 'source';

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
