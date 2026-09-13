import { UNTITLED_NAME } from '../constants';
import { platform } from '../platform';
import { appState } from '../state/app.svelte';
import { getStorage } from '../storage';
import { getNextUntitledName } from '../utils/files';
import { toast } from '../utils/toast';
import { StorageError } from '@tactile/storage';
import type { DirEntry } from '@tactile/storage';
import { moveToTrash } from './trash';

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

// Delete a folder. 'system' goes through the platform OS-trash hook when one
// is registered (desktop); otherwise it falls back to the collection's own
// .tactile/trash so the entry stays recoverable.
export const deleteFolder = async (path: string, recursive = false) => {
	const storage = await getStorage();

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

		if (children.length > 0) {
			toast.error('Could not delete folder', new Error('Folder is not empty'));
			return;
		}
	}

	try {
		switch (appState.collectionSettings.notes.trash_dir) {
			case 'system':
				if (platform().moveToSystemTrash) {
					await platform().moveToSystemTrash!(path);
				} else {
					await moveToTrash(path, true);
				}
				break;
			case 'tactile':
				await moveToTrash(path, true);
				break;
			case 'delete':
				await storage.remove(path, { recursive: true });
				break;
		}
	} catch (error) {
		toast.error('Could not delete folder', error);
		return;
	}
	toast.success(
		appState.collectionSettings.notes.trash_dir === 'delete'
			? 'Folder deleted'
			: 'Folder moved to trash'
	);
};

// Rename a folder
export const renameFolder = async (path: string, name: string) => {
	const storage = await getStorage();
	try {
		await storage.rename(path, `${path.split('/').slice(0, -1).join('/')}/${name}`);
	} catch (error) {
		toast.error('Could not rename folder', error);
	}
};

// Move a folder
export const moveFolder = async (source: string, target: string) => {
	const storage = await getStorage();

	// Get target directory
	const files = await storage.readDir(target);

	// Make sure there are no name conflicts
	const folderName = source.split('/').pop()!;

	if (files.some((file) => file.name === folderName && file.isDirectory)) {
		toast.error('Could not move folder', new Error(`"${folderName}" already exists there`));
		return;
	}

	try {
		await storage.rename(source, `${target}/${folderName}`);
	} catch (error) {
		toast.error('Could not move folder', error);
	}
};
