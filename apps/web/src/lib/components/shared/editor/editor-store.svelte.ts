import type { Editor } from '@tiptap/core';

type SaveListener = () => void;

export class EditorStore {
	// The tiptap editor instance, set by the editor component on mount
	instance = $state<Editor | undefined>(undefined);

	#saveListeners: SaveListener[] = [];

	subscribeToSaveEvents(callback: SaveListener): () => void {
		this.#saveListeners.push(callback);
		return () => {
			const index = this.#saveListeners.indexOf(callback);
			if (index > -1) {
				this.#saveListeners.splice(index, 1);
			}
		};
	}

	notifySaveEvent() {
		this.#saveListeners.forEach((listener) => listener());
	}
}
