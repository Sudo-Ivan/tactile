import { entry as entryTable } from '@/database/schema';
import { appState } from '@/store.svelte';
import type { FileEntry } from '../types';

// Filter out all hidden file entries (dotfiles)
export function buildFileTree(
	entries: (typeof entryTable.$inferSelect)[],
	rootPath?: string
): FileEntry[] {
	const entryMap = new Map<string, FileEntry>();

	// First pass: create FileEntry objects for all entries
	entries.forEach((entry) => {
		entryMap.set(entry.path, {
			path: entry.path,
			name: entry.name || undefined,
			children: entry.isFolder ? [] : undefined
		});
	});

	// Second pass: build the tree structure
	const rootEntries: FileEntry[] = [];
	entries.forEach((entry) => {
		const fileEntry = entryMap.get(entry.path)!;

		// If it's a root entry, add it to rootEntries
		if (entry.parentPath === appState.collection || entry.parentPath === rootPath) {
			rootEntries.push(fileEntry);
		} else {
			const parentEntry = entryMap.get(entry.parentPath);
			if (parentEntry && parentEntry.children) {
				parentEntry.children.push(fileEntry);
			}
		}
	});

	return rootEntries;
}

// Helper function to get the next available untitled name
export const getNextUntitledName = (
	files: (typeof entryTable.$inferSelect)[],
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
