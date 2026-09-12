import { TRASH_DIR } from '@/constants';
import { getStorage } from '@/storage';
import { appState } from '@/store.svelte';
import { StorageError } from '@tactile/storage';

export interface TrashItem {
	// File name inside .tactile/trash (may carry a timestamp prefix).
	name: string;
	originalPath: string;
	deletedAt: string;
	isFolder: boolean;
}

interface TrashManifest {
	items: TrashItem[];
}

const manifestPath = () => `${appState.collection}/.tactile/trash.json`;
const trashPath = () => `${appState.collection}/${TRASH_DIR}`;

const readManifest = async (): Promise<TrashItem[]> => {
	const storage = await getStorage();
	try {
		const parsed = JSON.parse(await storage.readTextFile(manifestPath())) as TrashManifest;
		return Array.isArray(parsed.items) ? parsed.items : [];
	} catch {
		return [];
	}
};

const writeManifest = async (items: TrashItem[]) => {
	const storage = await getStorage();
	await storage.writeTextFile(manifestPath(), JSON.stringify({ items }), {
		keepVersion: false
	});
};

// Move an entry into the collection's own trash. The manifest records where
// it came from so restore can put it back, and the stored name is made
// unique so older trashed entries are never overwritten.
export const moveToTrash = async (path: string, isFolder = false) => {
	const storage = await getStorage();
	const name = path.split('/').pop()!;

	await storage.mkdir(trashPath(), { recursive: true });

	let target = `${trashPath()}/${name}`;
	if (await storage.exists(target)) {
		target = `${trashPath()}/${Date.now()}-${name}`;
	}

	await storage.rename(path, target);

	const items = await readManifest();
	items.push({
		name: target.split('/').pop()!,
		originalPath: path,
		deletedAt: new Date().toISOString(),
		isFolder
	});
	await writeManifest(items);
};

export const listTrash = async (): Promise<TrashItem[]> => {
	return (await readManifest()).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
};

// Restore a trashed entry to its original location. Parent directories are
// recreated if they were deleted in the meantime. Throws on name conflict
// rather than overwriting an existing note.
export const restoreFromTrash = async (name: string) => {
	const storage = await getStorage();
	const items = await readManifest();
	const item = items.find((entry) => entry.name === name);
	if (!item) throw new Error('Trash entry not found');

	const parent = item.originalPath.split('/').slice(0, -1).join('/') || '/';
	const target = item.originalPath;
	if (await storage.exists(target)) {
		throw new Error(`A file already exists at ${target}`);
	}

	await storage.mkdir(parent, { recursive: true });
	await storage.rename(`${trashPath()}/${name}`, target);
	await writeManifest(items.filter((entry) => entry.name !== name));
};

// Delete a single trashed entry permanently.
export const deleteTrashItem = async (name: string) => {
	const storage = await getStorage();
	try {
		await storage.remove(`${trashPath()}/${name}`, { recursive: true });
	} catch (error) {
		if (!(error instanceof StorageError && error.code === 'not_found')) throw error;
	}
	const items = await readManifest();
	await writeManifest(items.filter((entry) => entry.name !== name));
};

// Empty the trash entirely.
export const emptyTrash = async () => {
	const storage = await getStorage();
	try {
		await storage.remove(trashPath(), { recursive: true });
	} catch (error) {
		if (!(error instanceof StorageError && error.code === 'not_found')) throw error;
	}
	await storage.mkdir(trashPath(), { recursive: true });
	await writeManifest([]);
};
