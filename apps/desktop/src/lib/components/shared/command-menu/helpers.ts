import { fetchCollectionEntries } from '@/api/collection';
import { appState } from '@/store.svelte';
import type { FileEntry } from '@/types';

export const getAllItems = async (
	isFolders?: boolean,
	entries?: FileEntry[]
): Promise<{ path: string; name: string }[]> => {
	const items: { path: string; name: string }[] = [];

	if (!entries) {
		entries = await fetchCollectionEntries().catch(() => []);
	}

	entries.forEach(async (entry) => {
		if (isFolders) {
			if (entry.children !== undefined && !entry.name?.startsWith('.')) {
				const folderPath = entry.path;
				const folderName = entry.path.replace(appState.collection ?? '', '');
				items.push({ path: folderPath, name: folderName });
				const subItems = await getAllItems(isFolders, entry.children);
				items.push(...subItems);
			}
		} else {
			if (entry.children === undefined && !entry.name?.startsWith('.')) {
				const notePath = entry.path;
				const noteName = entry.path.replace(appState.collection ?? '', '');
				items.push({ path: notePath, name: noteName });
			} else {
				const subItems = await getAllItems(isFolders, entry.children);
				items.push(...subItems);
			}
		}
	});

	return items;
};
