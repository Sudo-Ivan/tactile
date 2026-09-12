import { invoke } from '@tauri-apps/api/core';
import { isMobile } from '../platform.svelte';
import { storage } from '../storage';
import { DAILY_DIR, TACTILE_DIR, TRASH_DIR } from '../constants';
import { appState } from '../store.svelte';
import type { FileEntry } from '../types';

// Filter out all hidden file entries (dotfiles)
export function hideDotFiles(entries: FileEntry[]) {
	return entries.filter((entry) => {
		if (entry.name!.startsWith('.')) {
			return false;
		}
		if (entry.children) {
			entry.children = hideDotFiles(entry.children);
		}
		return true;
	});
}

// Show in folder
export async function showInFolder(path: string) {
	if (isMobile) return;
	await invoke('show_in_folder', { path });
}

// Name of the platform file manager, used for reveal-in-folder labels
export function fileManagerLabel() {
	return appState.platform === 'darwin'
		? 'Finder'
		: appState.platform === 'linux'
			? 'Files'
			: 'Explorer';
}

export async function validateTactileFolder(path: string) {
	if (path === null) return;

	const tactileFolder = await storage.readDir(`${path}/${TACTILE_DIR}`).catch(() => null);

	if (!tactileFolder) {
		// Create .tactile folder
		await storage.mkdir(`${path}/${TACTILE_DIR}`);

		// Create trash folder
		await storage.mkdir(`${path}/${TRASH_DIR}`);

		// Create daily folder
		await storage.mkdir(`${path}/${DAILY_DIR}`);
	}
}

// Helper function to get the next available untitled name
export const getNextUntitledName = (
	files: { name: string }[],
	prefix: string,
	extension: string = ''
) => {
	const untitledItems = files
		.filter(
			(file) =>
				file.name?.toLowerCase().startsWith(prefix.toLowerCase()) &&
				(extension ? file.name?.toLowerCase().endsWith(extension.toLowerCase()) : true)
		)
		.map((file) => file.name!);

	let maxNumber = 0;
	const numberPattern = new RegExp(`^${prefix}(?: (\\d+))?${extension}$`, 'i');

	untitledItems.forEach((name) => {
		const match = name.match(numberPattern);
		if (match) {
			const num = match[1] ? parseInt(match[1]) : 0;
			maxNumber = Math.max(maxNumber, num);
		}
	});

	for (let i = 0; i <= maxNumber + 1; i++) {
		const newName = i === 0 ? `${prefix}${extension}` : `${prefix} ${i}${extension}`;
		if (!untitledItems.includes(newName)) {
			return newName;
		}
	}

	// This should never happen, but just in case
	return `${prefix} ${maxNumber + 1}${extension}`;
};

export const sortFileEntry = (a: FileEntry, b: FileEntry): number => {
	const isDirectory = (file: FileEntry) => file.children != null;
	if (isDirectory(a) && isDirectory(b)) {
		return naturalSort(a.name!, b.name!);
	}
	if (isDirectory(a)) return -1;
	if (isDirectory(b)) return 1;
	return naturalSort(a.name!, b.name!);
};

const naturalSort = (a: string, b: string): number => {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};
