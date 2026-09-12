import { exportNoteHtml } from '@tactile/core/api/export';
import { registerPlatform } from '@tactile/core/platform';
import { registerStorageProvider } from '@tactile/core/storage';
import { APP_SETTINGS_FILENAME, COLLECTIONS_FILENAME, OS_TRASH_DIR } from '@/constants';
import { isMobile } from '@/platform.svelte';
import { appState, setAppTheme } from '@tactile/core/state';
import { fileManagerLabel, showInFolder } from '@/utils/fs';
import { createTauriBackend, VersionedBackend } from '@tactile/storage';
import { BaseDirectory, homeDir } from '@tauri-apps/api/path';
import { open, save } from '@tauri-apps/plugin-dialog';
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
import { open as browserOpen } from '@tauri-apps/plugin-shell';

// Shared storage backend over the real filesystem. Mutations emit change
// events on the same surface the web app uses, so api code and the future
// sync layer behave identically on both platforms. External writes made
// outside the app still arrive through the plugin-fs watcher in the sidebars.
const storage = new VersionedBackend(
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

// Hand the backend and the desktop platform capabilities to @tactile/core so
// its api/utils modules work identically on both apps.
registerStorageProvider(() => storage);
registerPlatform({
	pickDirectory: async () => (await open({ directory: true })) as string | null,
	moveToSystemTrash: async (path) => {
		await storage.rename(
			path,
			`${await homeDir()}${OS_TRASH_DIR[appState.platform!]}${path.split('/').pop()!}`
		);
	},
	readAppSettings: () =>
		storage
			.readTextFile(APP_SETTINGS_FILENAME, { baseDir: BaseDirectory.AppData })
			.catch(() => null),
	writeAppSettings: (json) =>
		storage.writeTextFile(APP_SETTINGS_FILENAME, json, { baseDir: BaseDirectory.AppData }),
	readCollections: () =>
		storage
			.readTextFile(COLLECTIONS_FILENAME, { baseDir: BaseDirectory.AppData })
			.catch(() => null),
	writeCollections: (json) =>
		storage.writeTextFile(COLLECTIONS_FILENAME, json, { baseDir: BaseDirectory.AppData }),
	// Ask where to save, then write. A cancelled dialog just skips the write.
	saveExport: async (name, data) => {
		const target = await save({ defaultPath: name });
		if (!target) return;
		if (typeof data === 'string') {
			await storage.writeTextFile(target, data, { keepVersion: false });
		} else {
			await storage.writeFile(target, data, { keepVersion: false });
		}
	},

	// UI/chrome capabilities consumed by shared components.
	isMobile,
	hasHeader: () => appState.platform === 'darwin',
	openExternal: (url) => browserOpen(url),
	showInFolder,
	fileManagerLabel,
	getThemeMode: () => appState.appTheme,
	setThemeMode: (mode) => setAppTheme(mode),
	printNote: (path) => exportNoteHtml(path),
	printNoteLabel: 'Export note as printable HTML'
});
