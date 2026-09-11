import { activeFile, collection, noteHistory } from '@/store';
import { hideDotFiles, validateTactileFolder, sortFileEntry } from '@/utils';
import { readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { get } from 'svelte/store';
import { open } from '@tauri-apps/plugin-dialog';
import { BaseDirectory } from '@tauri-apps/api/path';
import type { CollectionParams, FileEntry } from '@/types';

// In Tauri v2 plugin-fs, readDir is not recursive and DirEntry has no path
// field, so the FileEntry tree is built manually to match the v1 shape.
const readDirRecursive = async (dirPath: string): Promise<FileEntry[]> => {
	const dirEntries = await readDir(dirPath);
	const entries: FileEntry[] = [];

	for (const dirEntry of dirEntries) {
		const entry: FileEntry = {
			name: dirEntry.name,
			path: `${dirPath}/${dirEntry.name}`,
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
) => {
	dirPath = dirPath || get(collection);

	if (!dirPath) new Error('No directory path provided');

	let files = await readDirRecursive(dirPath);

	if (sort === 'name') {
		files.sort((a, b) => sortFileEntry(a, b));
	}

	// Hide dotfiles
	if (!showDotfiles) {
		files = hideDotFiles(files);
	}

	return files;
};

export const loadCollection = async (path?: string | undefined) => {
	// If no path is provided, open a dialog
	if (!path) {
		path = (await open({ directory: true })) as string;
	}

	// Return if no path is provided
	if (!path) return;

	// Set collection path
	collection.set(path);

	// Reset all collection states
	noteHistory.set([]);
	activeFile.set(null);

	// Validate .tactile folder
	await validateTactileFolder(path);

	// Add collection to collections data
	const collectionObj = {
		path: path,
		name: path.split('/').pop(),
		lastOpened: new Date().toISOString()
	};

	const collections = await readTextFile('collections.json', {
		baseDir: BaseDirectory.AppData
	}).catch(() => null);

	if (!collections) {
		await writeTextFile('collections.json', JSON.stringify([collectionObj]), {
			baseDir: BaseDirectory.AppData
		});
	} else {
		const collectionsArray = JSON.parse(collections);
		const index = collectionsArray.findIndex((item: { path: string }) => item.path === path);

		if (index !== -1) {
			collectionsArray.splice(index, 1);
		}

		collectionsArray.push(collectionObj);
		await writeTextFile('collections.json', JSON.stringify(collectionsArray), {
			baseDir: BaseDirectory.AppData
		});
	}
};

// Get all collections
export const getCollections = async (): Promise<CollectionParams[]> => {
	const collections = await readTextFile('collections.json', {
		baseDir: BaseDirectory.AppData
	}).catch(() => null);

	if (!collections) return [];

	return JSON.parse(collections);
};
