import type { Editor } from '@tiptap/core';

type SaveListener = () => void;

export class EditorStore {
	// The tiptap editor instance, set by the editor component on mount
	instance = $state<Editor | undefined>(undefined);

	// Path of the note with unpersisted edits. Set on editor updates; used to
	// flush pending saves before navigation and to skip stale debounced saves.
	dirtyPath: string | null = null;

	// Bumped on every editor update so a completed save only clears dirtyPath
	// when no newer edits happened while it was in flight.
	saveGeneration = 0;

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
