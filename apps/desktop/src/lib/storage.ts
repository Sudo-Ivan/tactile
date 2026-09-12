import { appState } from '@/store.svelte';
import { createTauriBackend, VersionedBackend } from '@tactile/storage';
import {
	exists,
	mkdir,
	readDir,
	readFile,
	readTextFile,
	remove,
	rename,
	stat,
	writeFile,
	writeTextFile
} from '@tauri-apps/plugin-fs';

// Shared storage backend over the real filesystem. Mutations emit change
// events on the same surface the web app uses, so api code and the future
// sync layer behave identically on both platforms. External writes made
// outside the app still arrive through the plugin-fs watcher in the sidebars.
export const storage = new VersionedBackend(
	createTauriBackend({
		exists,
		mkdir,
		readDir,
		readFile,
		readTextFile,
		remove,
		rename,
		stat,
		writeFile,
		writeTextFile
	}),
	{
		// Collections live at arbitrary absolute paths on desktop, so the
		// version root is the active collection, not the first path segment.
		rootFor: (path) => {
			const collection = appState.collection;
			if (!collection) return undefined;
			return path === collection || path.startsWith(`${collection}/`) ? collection : undefined;
		}
	}
);
