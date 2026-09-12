import type { Editor } from '@tiptap/core';
import { SvelteSet } from 'svelte/reactivity';

type SaveListener = () => void;

class EditorStore {
	#instance = $state<Editor>();
	#saveListeners = new SvelteSet<SaveListener>();

	// Path of the note with unpersisted edits. Set on editor updates; used to
	// flush pending saves before navigation and to skip stale debounced saves.
	dirtyPath: string | null = null;

	// Bumped on every editor update so a completed save only clears dirtyPath
	// when no newer edits happened while it was in flight.
	saveGeneration = 0;

	get instance() {
		return this.#instance as Editor;
	}

	set instance(editor: Editor) {
		this.#instance = editor;
	}

	subscribeToSaveEvents(callback: SaveListener): () => void {
		this.#saveListeners.add(callback);
		return () => {
			this.#saveListeners.delete(callback);
		};
	}

	notifySaveEvent() {
		this.#saveListeners.forEach((listener) => listener());
	}
}

export function createEditorStore() {
	return new EditorStore();
}
