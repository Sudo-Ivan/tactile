import {
	createBrowserBackend,
	ensureFormatVersion,
	isInternalPath,
	isUnder,
	type StorageBackend,
	type Unsubscribe
} from '@tactile/storage';
import { migrateFromPGlite } from './migrate';
import { seedIfEmpty } from './seed';

let backendPromise: Promise<StorageBackend> | null = null;
let initPromise: Promise<StorageBackend> | null = null;

// The storage backend singleton. OPFS where available, IndexedDB otherwise,
// wrapped in versioning. Resolves on first use.
export function getStorage(): Promise<StorageBackend> {
	if (!backendPromise) {
		backendPromise = Promise.resolve(createBrowserBackend({ rootName: 'tactile' }));
	}
	return backendPromise;
}

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

// Subscribe to storage changes under a collection path. Debounced so a burst
// of writes (imports, folder moves) triggers one refresh.
export async function subscribeCollectionChanges(
	collectionPath: string,
	cb: () => void,
	debounceMs = 120
): Promise<Unsubscribe> {
	const backend = await getStorage();
	let timer: ReturnType<typeof setTimeout> | undefined;
	return backend.onDidChange((event) => {
		// Internal writes (settings, version snapshots) should not trigger
		// file-tree refreshes, but a rename into .tactile/trash still needs to
		// refresh because the source path leaves the visible tree.
		const relevant =
			(isUnder(event.path, collectionPath) && !isInternalPath(event.path)) ||
			(event.oldPath !== undefined &&
				isUnder(event.oldPath, collectionPath) &&
				!isInternalPath(event.oldPath));
		if (!relevant) return;
		clearTimeout(timer);
		timer = setTimeout(cb, debounceMs);
	});
}
