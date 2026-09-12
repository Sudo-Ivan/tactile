import type { Editor } from '@tiptap/core';

type SaveListener = () => void;

export class EditorStore {
	// The tiptap editor instance, set by the editor component on mount.
	// Undefined until the editor exists and after it is destroyed.
	instance = $state<Editor | undefined>(undefined);

	// Path of the note with unpersisted edits. Set on editor updates; used to
	// flush pending saves before navigation and to skip stale debounced saves.
	dirtyPath: string | null = null;

	// Bumped on every editor update so a completed save only clears dirtyPath
	// when no newer edits happened while it was in flight.
	saveGeneration = 0;

	#saveListeners: SaveListener[] = [];

	// Register or clear the live tiptap instance. Called by the editor
	// component on create/transaction/destroy.
	setInstance(editor: Editor | undefined) {
		this.instance = editor;
	}

	// Mark `path` as having unsaved edits. Returns the save generation so a
	// debounced save can later verify no newer edits landed while in flight.
	markDirty(path: string): number {
		this.dirtyPath = path;
		return ++this.saveGeneration;
	}

	// Clear the dirty flag. When a generation is given, only clears when no
	// newer edits happened since it was captured.
	clearDirty(generation?: number) {
		if (generation === undefined || this.saveGeneration === generation) {
			this.dirtyPath = null;
		}
	}

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

export function createEditorStore(): EditorStore {
	return new EditorStore();
}
