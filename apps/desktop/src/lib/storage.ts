import { createTauriBackend } from '@tactile/storage';
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
export const storage = createTauriBackend({
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
});
