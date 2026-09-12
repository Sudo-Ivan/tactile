import type { Editor } from '@tiptap/core';
import { SvelteSet } from 'svelte/reactivity';

type SaveListener = () => void;

class EditorStore {
	#instance = $state<Editor>();
	#saveListeners = new SvelteSet<SaveListener>();

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
