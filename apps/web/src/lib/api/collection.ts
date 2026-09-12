import { COLLECTIONS_PATH, DAILY_NOTES_DIR, TRASH_DIR } from '@/constants';
import { getStorage } from '@/storage';
import { appState } from '@/store.svelte';
import type { CollectionParams, FileEntry } from '@/types';
import { hideDotFiles, sortFileEntry } from '@/utils';
import { StorageError } from '@tactile/storage';

// Recursively read a directory into the FileEntry tree the UI expects.
// Directories get a children array; files get none.
const readDirRecursive = async (dirPath: string): Promise<FileEntry[]> => {
	const storage = await getStorage();
	const dirEntries = await storage.readDir(dirPath);
	const entries: FileEntry[] = [];

	for (const dirEntry of dirEntries) {
		const entry: FileEntry = {
			name: dirEntry.name,
			path: `${dirPath}/${dirEntry.name}`.replace('//', '/')
		};

		if (dirEntry.isDirectory) {
			entry.children = await readDirRecursive(entry.path);
		}

		entries.push(entry);
	}

	return entries;
};

// Ensure the internal folders every collection needs exist. Mirrors the
// desktop app's .tactile layout so collections can move between platforms.
const validateTactileFolder = async (collectionPath: string) => {
	const storage = await getStorage();
	for (const dir of [
		`${collectionPath}/.tactile`,
		`${collectionPath}/${TRASH_DIR}`,
		`${collectionPath}${DAILY_NOTES_DIR}`
	]) {
		await storage.mkdir(dir, { recursive: true });
	}
};

// Fetch the collection entries
export const fetchCollectionEntries = async (
	dirPath?: string,
	sort: 'name' | 'date' = 'name',
	showDotfiles = false
): Promise<FileEntry[]> => {
	dirPath = dirPath || appState.collection;
	if (!dirPath) throw new Error('No directory path provided');

	let fileEntries: FileEntry[];
	try {
		fileEntries = await readDirRecursive(dirPath);
	} catch (error) {
		if (error instanceof StorageError && error.code === 'not_found') {
			fileEntries = [];
		} else {
			throw error;
		}
	}

	// Sort entries recursively
	const sortEntries = (entries: FileEntry[]) => {
		entries.sort((a, b) => {
			if (sort === 'name' && a.name && b.name) {
				return sortFileEntry(a, b);
			} else if (sort === 'date') {
				console.warn('Sorting by date is not implemented yet');
			}
			return 0;
		});

		entries.forEach((entry) => {
			if (entry.children) {
				sortEntries(entry.children);
			}
		});
	};

	sortEntries(fileEntries);
	appState.collectionEntries = showDotfiles ? fileEntries : hideDotFiles(fileEntries);

	return appState.collectionEntries;
};

export const loadCollection = async (path?: string | undefined) => {
	// Return if no path is provided
	if (!path) return;

	const storage = await getStorage();

	// Set collection path
	appState.collection = path;

	// Reset all collection states
	appState.noteHistory = [];
	appState.activeFile = null;

	// Validate .tactile folder
	await validateTactileFolder(path);

	// Add collection to collections data
	const collectionObj: CollectionParams = {
		path: path,
		name: path.split('/').pop()!,
		lastOpened: new Date().toISOString()
	};

	let collections: CollectionParams[];
	try {
		collections = JSON.parse(await storage.readTextFile(COLLECTIONS_PATH));
	} catch {
		collections = [];
	}

	const index = collections.findIndex((item) => item.path === path);
	if (index !== -1) collections.splice(index, 1);
	collections.push(collectionObj);

	await storage.mkdir('/.tactile', { recursive: true });
	await storage.writeTextFile(COLLECTIONS_PATH, JSON.stringify(collections), {
		keepVersion: false
	});
};

// Get all collections
export const getCollections = async (): Promise<CollectionParams[]> => {
	const storage = await getStorage();
	try {
		return JSON.parse(await storage.readTextFile(COLLECTIONS_PATH));
	} catch {
		return [];
	}
};
