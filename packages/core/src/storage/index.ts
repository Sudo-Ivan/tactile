import { isInternalPath, isUnder, type StorageBackend, type Unsubscribe } from '@tactile/storage';

// Each app registers a provider for its storage backend at startup: the web
// app wraps createBrowserBackend (OPFS/IndexedDB), the desktop app a
// VersionedBackend over tauri-plugin-fs. api/utils code then shares one
// access path regardless of platform.
type StorageProvider = () => StorageBackend | Promise<StorageBackend>;

let provider: StorageProvider | null = null;

export function registerStorageProvider(p: StorageProvider): void {
	provider = p;
}

export function getStorage(): Promise<StorageBackend> {
	if (!provider) {
		throw new Error('@tactile/core: registerStorageProvider() must be called before using storage');
	}
	return Promise.resolve(provider());
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
