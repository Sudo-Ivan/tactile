import { TRASH_DIR, UNTITLED_NAME } from '@/constants';
import { getStorage } from '@/storage';
import { appState } from '@/store.svelte';
import { getNextUntitledName } from '@/utils';
import { StorageError } from '@tactile/storage';
import type { DirEntry } from '@tactile/storage';

// Create a new folder
export const createFolder = async (dirPath: string) => {
	const storage = await getStorage();

	// Read the directory; a missing directory behaves like an empty one.
	let files: DirEntry[];
	try {
		files = await storage.readDir(dirPath);
	} catch (error) {
		if (error instanceof StorageError && error.code === 'not_found') {
			files = [];
		} else {
			throw error;
		}
	}

	// Generate a new name (Untitled, if there are any exiting Untitled folders, increment the number by 1)
	const name = getNextUntitledName(files, UNTITLED_NAME);

	const folderPath = `${dirPath}/${name}`.replace('//', '/');

	// Save the new folder
	await storage.mkdir(folderPath, { recursive: true });

	return folderPath;
};

// Delete a folder. 'system' trash falls back to the collection's own
// .tactile/trash: the browser cannot reach the OS trash.
export const deleteFolder = async (path: string, recursive = false) => {
	const storage = await getStorage();
	const folderName = path.split('/').pop()!;

	if (!recursive) {
		let children: DirEntry[];
		try {
			children = await storage.readDir(path);
		} catch (error) {
			if (error instanceof StorageError && error.code === 'not_found') {
				children = [];
			} else {
				throw error;
			}
		}

		// Remove .DS_Store files from the children
		children = children.filter((child) => child.name !== '.DS_Store');

		// TODO: implement empty children check

		if (children.length > 0) {
			throw new Error('Folder is not empty');
		}
	}

	switch (appState.collectionSettings.notes.trash_dir) {
		case 'delete':
			await storage.remove(path, { recursive: true });
			break;
		case 'tactile':
		case 'system':
		default: {
			let target = `${appState.collection}/${TRASH_DIR}/${folderName}`;
			if (await storage.exists(target)) {
				target = `${appState.collection}/${TRASH_DIR}/${Date.now()}-${folderName}`;
			}
			await storage.rename(path, target);
			break;
		}
	}
};

// Rename a folder
export const renameFolder = async (path: string, name: string) => {
	const storage = await getStorage();
	await storage.rename(path, `${path.split('/').slice(0, -1).join('/')}/${name}`);
};

// Move a folder
export const moveFolder = async (source: string, target: string) => {
	const storage = await getStorage();

	// Get target directory
	const files = await storage.readDir(target);

	// Make sure there are no name conflicts
	const folderName = source.split('/').pop()!;

	if (files.some((file) => file.name === folderName && file.isDirectory)) {
		throw new Error('Name conflict');
	}

	await storage.rename(source, `${target}/${folderName}`);
};
