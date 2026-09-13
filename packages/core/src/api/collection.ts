import { platform } from '../platform';
import { appState } from '../state/app.svelte';
import { clearAttachmentCache } from './attachments';
import { clearGraphCache } from './graph';
import { getStorage } from '../storage';
import type { CollectionParams, FileEntry } from '../types';
import { hideDotFiles, sortFileEntry, validateTactileFolder } from '../utils/files';
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
			path: `${dirPath}/${dirEntry.name}`.replace('//', '/'),
			isDirectory: dirEntry.isDirectory,
			isFile: dirEntry.isFile,
			isSymlink: dirEntry.isSymlink
		};

		if (dirEntry.isDirectory) {
			entry.children = await readDirRecursive(entry.path);
		}

		entries.push(entry);
	}

	return entries;
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
	// If no path is provided, ask the platform for one (native picker on
	// desktop; web callers always pass a path).
	if (!path) {
		path = (await platform().pickDirectory?.()) ?? undefined;
	}

	// Return if no path is provided
	if (!path) return;

	// Set collection path
	appState.collection = path;

	// Reset all collection states
	appState.noteHistory = [];
	appState.activeFile = null;
	clearAttachmentCache();
	clearGraphCache();

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
		collections = JSON.parse((await platform().readCollections()) ?? '[]');
	} catch {
		collections = [];
	}

	const index = collections.findIndex((item) => item.path === path);
	if (index !== -1) collections.splice(index, 1);
	collections.push(collectionObj);

	await platform().writeCollections(JSON.stringify(collections));
};

// Get all collections
export const getCollections = async (): Promise<CollectionParams[]> => {
	try {
		return JSON.parse((await platform().readCollections()) ?? '[]');
	} catch {
		return [];
	}
};

// Restore the most recently opened collection at startup. Sets the
// collection path only - unlike loadCollection it does not rewrite the
// collections index or validate the .tactile folder.
export const restoreLatestCollection = async (): Promise<string | undefined> => {
	const collections = await getCollections();
	if (collections.length === 0) return undefined;

	const latest = collections.reduce((prev, current) =>
		new Date(current.lastOpened).getTime() > new Date(prev.lastOpened).getTime() ? current : prev
	);

	if (appState.collection !== latest.path) {
		clearAttachmentCache();
		clearGraphCache();
	}
	appState.collection = latest.path;
	return latest.path;
};
