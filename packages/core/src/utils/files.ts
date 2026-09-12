import { DAILY_DIR, TACTILE_DIR, TRASH_DIR } from '../constants';
import { getStorage } from '../storage';
import type { FileEntry } from '../types';

// Filter out all hidden file entries (dotfiles)
export function hideDotFiles(entries: FileEntry[]): FileEntry[] {
	return entries.filter((entry) => {
		if (entry.name?.startsWith('.')) {
			return false;
		}
		if (entry.children) {
			entry.children = hideDotFiles(entry.children);
		}
		return true;
	});
}

// Helper function to get the next available untitled name
export const getNextUntitledName = (
	files: { name?: string }[],
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

// Ensure the internal folders every collection needs exist (.tactile, its
// trash and daily dirs). Identical layout on both platforms so collections
// can move between them.
export async function validateTactileFolder(path: string) {
	if (path === null) return;

	const storage = await getStorage();
	for (const dir of [TACTILE_DIR, TRASH_DIR, DAILY_DIR]) {
		const target = `${path}/${dir}`;
		if (!(await storage.exists(target))) {
			await storage.mkdir(target, { recursive: true });
		}
	}
}
