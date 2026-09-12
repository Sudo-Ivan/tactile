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
