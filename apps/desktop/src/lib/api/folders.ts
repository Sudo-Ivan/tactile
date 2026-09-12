import { OS_TRASH_DIR, TRASH_DIR, UNTITLED_NAME } from '@/constants';
import { appState } from '@/store.svelte';
import { getNextUntitledName } from '@/utils/fs';
import { homeDir } from '@tauri-apps/api/path';
import { storage } from '@/storage';

// Create a new folder
export const createFolder = async (dirPath: string) => {
	// Read the directory
	const files = await storage.readDir(dirPath);

	// Generate a new name
	const name = getNextUntitledName(files, UNTITLED_NAME);

	// Save the new folder
	await storage.mkdir(`${dirPath}/${name}`);

	return `${dirPath}/${name}`;
};

// Delete a folder
export const deleteFolder = async (path: string, recursive = false) => {
	const folderName = path.split('/').pop()!;

	if (!recursive) {
		let children = await storage.readDir(path);

		// Remove .DS_Store files from the children
		children = children.filter((child) => child.name !== '.DS_Store');

		// TODO: implement empty children check

		if (children.length > 0) {
			throw new Error('Folder is not empty');
		}
	}

	switch (appState.collectionSettings.notes.trash_dir) {
		case 'system':
			await storage.rename(
				path,
				`${await homeDir()}${OS_TRASH_DIR[appState.platform!]}${folderName}`
			);
			break;
		case 'tactile':
			await storage.rename(path, `${appState.collection}/${TRASH_DIR}/${path.split('/').pop()!}`);
			break;
		case 'delete':
			await storage.remove(path);
			break;
	}
};

// Rename a folder
export const renameFolder = async (path: string, name: string) => {
	await storage.rename(path, `${path.split('/').slice(0, -1).join('/')}/${name}`);
};

// Move a folder
export const moveFolder = async (source: string, target: string) => {
	// Get target directory
	const files = await storage.readDir(target);

	// Make sure there are no name conflicts
	const folderName = source.split('/').pop()!;

	if (files.some((file) => file.name === folderName && file.isDirectory)) {
		throw new Error('Name conflict');
	}

	await storage.rename(source, `${target}/${folderName}`);
};
