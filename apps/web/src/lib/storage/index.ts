import { createBrowserBackend, ensureFormatVersion, type StorageBackend } from '@tactile/storage';
import { printNote } from '@tactile/core/api/export';
import { registerPlatform } from '@tactile/core/platform';
import { registerStorageProvider } from '@tactile/core/storage';
import { COLLECTIONS_PATH, STORAGE_KEYS } from '@/constants';
import { downloadBlob } from '@tactile/core/utils/download';
import { setMode, userPrefersMode } from 'mode-watcher';
import { migrateFromPGlite } from './migrate';
import { seedIfEmpty } from './seed';

let backendPromise: Promise<StorageBackend> | null = null;
let initPromise: Promise<StorageBackend> | null = null;

// The storage backend singleton. OPFS where available, IndexedDB otherwise,
// wrapped in versioning. Resolves on first use.
function getStorage(): Promise<StorageBackend> {
	if (!backendPromise) {
		backendPromise = Promise.resolve(createBrowserBackend({ rootName: 'tactile' }));
	}
	return backendPromise;
}

// Hand the backend and the browser platform capabilities to @tactile/core so
// its api/utils modules work identically on both apps.
registerStorageProvider(getStorage);
registerPlatform({
	readAppSettings: () => window.localStorage.getItem(STORAGE_KEYS.appSettings),
	writeAppSettings: (json) => window.localStorage.setItem(STORAGE_KEYS.appSettings, json),
	readCollections: async () => {
		const storage = await getStorage();
		return storage.readTextFile(COLLECTIONS_PATH).catch(() => null);
	},
	writeCollections: async (json) => {
		const storage = await getStorage();
		await storage.mkdir('/.tactile', { recursive: true });
		await storage.writeTextFile(COLLECTIONS_PATH, json, { keepVersion: false });
	},
	saveExport: (name, data, mime) => downloadBlob(name, data as BlobPart, mime),

	// UI/chrome capabilities consumed by shared components. The web app
	// always renders the fixed header and uses mode-watcher for themes.
	hasHeader: () => true,
	getThemeMode: () => userPrefersMode.current,
	setThemeMode: (mode) => setMode(mode),
	printNote: (path) => printNote(path),
	printNoteLabel: 'Export note as PDF'
});

// Full startup: backend, format version, PGlite migration, seed.
// Idempotent; concurrent callers share one promise.
export function initStorage(): Promise<StorageBackend> {
	if (!initPromise) {
		initPromise = (async () => {
			const backend = await getStorage();
			await ensureFormatVersion(backend);
			// One-shot import of any data left behind by the PGlite era.
			// Runs before seeding so migrated users are not overwritten.
			await migrateFromPGlite(backend);
			await seedIfEmpty(backend);
			return backend;
		})();
	}
	return initPromise;
}

export { subscribeCollectionChanges } from '@tactile/core/storage';
