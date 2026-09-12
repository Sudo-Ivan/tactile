import { COLLECTIONS_PATH, COLLECTION_SETTINGS_PATH, TACTILE_DIR } from '@/constants';
import type { StorageBackend } from '@tactile/storage';

interface LegacyEntryRow {
	path: string;
	name: string | null;
	parent_path: string;
	collection_path: string | null;
	content: string | null;
	is_folder: boolean | null;
}

interface LegacyCollectionRow {
	path: string;
	name: string;
	last_opened: string;
}

interface LegacySettingsRow {
	collection_path: string;
	editor: unknown;
	notes: unknown;
}

// The old app kept everything in PGlite, persisted to IndexedDB under the
// `idb://tactile` data dir. Emscripten's IDBFS names its database after the
// mount path, which is '/pglite/tactile' (PG_ROOT + '/' + dataDir). Match
// exactly that plus the bare 'tactile' name for safety; never match
// 'tactile-fs', which is this app's own IndexedDB fallback backend.
const LEGACY_DB_NAMES = new Set(['/pglite/tactile', 'tactile']);

export async function migrateFromPGlite(backend: StorageBackend): Promise<boolean> {
	if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
		return false;
	}

	let names: string[];
	try {
		names = ((await indexedDB.databases()) ?? [])
			.map((db) => db.name)
			.filter((name): name is string => typeof name === 'string');
	} catch {
		return false;
	}

	const legacyDbs = names.filter((name) => LEGACY_DB_NAMES.has(name));
	if (legacyDbs.length === 0) return false;

	console.info(`storage: migrating legacy PGlite data (${legacyDbs.join(', ')})`);

	let migrated = false;
	try {
		// Lazy import: only users with legacy data pay for the wasm download.
		const { PGlite } = await import('@electric-sql/pglite');
		const pg = await PGlite.create({ dataDir: 'idb://tactile' });
		try {
			migrated = await dumpIntoBackend(pg, backend);
		} finally {
			await pg.close().catch(() => undefined);
		}
	} catch (error) {
		console.warn('storage: PGlite migration failed, continuing with empty store', error);
	}

	// Clean up the legacy databases either way: a successful dump means the
	// data now lives in files; a failed one means the db was unreadable and
	// keeping it would retry the migration on every launch.
	for (const name of legacyDbs) {
		try {
			await new Promise<void>((resolve) => {
				const req = indexedDB.deleteDatabase(name);
				req.onsuccess = () => resolve();
				req.onerror = () => resolve();
				// Another tab holding the db open blocks deletion; do not wait
				// forever, the next launch will try again.
				req.onblocked = () => resolve();
				setTimeout(resolve, 3000);
			});
		} catch {
			// Deletion is best effort.
		}
	}
	return migrated;
}

interface PGliteLike {
	query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
	close(): Promise<void>;
}

async function dumpIntoBackend(pg: PGliteLike, backend: StorageBackend): Promise<boolean> {
	// A database created fresh by this open call has no tables; treat query
	// failures as "nothing to migrate" rather than fatal.
	const collections = await pg
		.query<LegacyCollectionRow>('SELECT path, name, last_opened FROM collection')
		.then((r) => r.rows)
		.catch(() => null);
	if (!collections) return false;

	const entries = await pg
		.query<LegacyEntryRow>(
			'SELECT path, name, parent_path, collection_path, content, is_folder FROM entry'
		)
		.then((r) => r.rows)
		.catch(() => [] as LegacyEntryRow[]);

	// Directories first so files always land in existing parents. Sorting by
	// path depth guarantees parents are created before children.
	const sorted = [...entries].sort((a, b) => a.path.split('/').length - b.path.split('/').length);
	for (const entry of sorted) {
		try {
			if (entry.is_folder) {
				await backend.mkdir(entry.path, { recursive: true, keepVersion: false });
			} else {
				const parent = entry.parent_path || '/';
				await backend.mkdir(parent, { recursive: true, keepVersion: false });
				await backend.writeTextFile(entry.path, entry.content ?? '', { keepVersion: false });
			}
		} catch (error) {
			console.warn(`storage: failed to migrate entry ${entry.path}`, error);
		}
	}

	const settingsRows = await pg
		.query<LegacySettingsRow>('SELECT collection_path, editor, notes FROM collection_settings')
		.then((r) => r.rows)
		.catch(() => [] as LegacySettingsRow[]);
	for (const row of settingsRows) {
		try {
			const dir = `${row.collection_path}/${TACTILE_DIR}`;
			await backend.mkdir(dir, { recursive: true, keepVersion: false });
			await backend.writeTextFile(
				`${row.collection_path}/${COLLECTION_SETTINGS_PATH}`,
				JSON.stringify({ editor: row.editor, notes: row.notes }),
				{ keepVersion: false }
			);
		} catch (error) {
			console.warn(`storage: failed to migrate settings for ${row.collection_path}`, error);
		}
	}

	const collectionParams = collections.map((c) => ({
		path: c.path,
		name: c.name,
		lastOpened:
			typeof c.last_opened === 'string' ? c.last_opened : new Date(c.last_opened).toISOString()
	}));
	await backend.mkdir('/' + TACTILE_DIR, { recursive: true, keepVersion: false });
	await backend.writeTextFile(COLLECTIONS_PATH, JSON.stringify(collectionParams), {
		keepVersion: false
	});

	console.info(`storage: migrated ${collections.length} collections and ${entries.length} entries`);
	return true;
}
