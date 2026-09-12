import { MARKDOWN_EXTENSION, UNTITLED_NAME } from '@/constants';
import { getStorage } from '@/storage';
import { appState } from '@/store.svelte';
import type { FileVersion, NoteMetadataParams } from '@/types';
import { calculateReadingTime, getNextUntitledName, setEditorContent } from '@/utils';
import { isVersioned, normalizePath, StorageError } from '@tactile/storage';
import type { DirEntry } from '@tactile/storage';
import { moveToTrash } from './trash';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Create a new note
export const createNote = async (dirPath: string, name?: string) => {
	const storage = await getStorage();

	// Read the directory; a missing directory behaves like an empty one so
	// notes can be created in dirs that do not exist yet on disk.
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

	// Generate a new name (Untitled.md, if there are any exiting Untitled notes, increment the number by 1)
	if (!name) {
		name = getNextUntitledName(files, UNTITLED_NAME, MARKDOWN_EXTENSION);
	} else {
		// Caller-provided names get the same cleanup as renames.
		if (!name.endsWith(MARKDOWN_EXTENSION)) {
			name += MARKDOWN_EXTENSION;
		}
		if (files.some((file) => file.name?.toLowerCase() === name!.toLowerCase())) {
			throw new Error('Name conflict');
		}
	}

	const notePath = `${dirPath}/${name}`.replace('//', '/');

	// Save the new note
	await storage.mkdir(dirPath, { recursive: true });
	await storage.writeTextFile(notePath, '');

	// Open the note
	openNote(notePath);
};

// Open a note
export async function openNote(path: string, skipHistory = false) {
	const storage = await getStorage();
	const fileContent = await storage.readTextFile(path);
	setEditorContent(fileContent);
	// Keep the source buffer in sync so switching notes while in source mode
	// never shows stale content.
	appState.sourceContent = fileContent;
	appState.activeFile = path;
	if (!skipHistory) {
		if (appState.noteHistory[appState.noteHistory.length - 1] !== path) {
			appState.noteHistory.push(path);
		}
	}
}

// Delete a note. The browser has no OS trash, so 'system' falls back to the
// collection's own .tactile/trash; the trash manifest keeps the original
// path so entries can be restored.
export const deleteNote = async (path: string) => {
	const storage = await getStorage();
	switch (appState.collectionSettings.notes.trash_dir) {
		case 'delete':
			await storage.remove(path);
			break;
		case 'tactile':
		case 'system':
		default:
			await moveToTrash(path, false);
			break;
	}
	appState.activeFile = null;
};

// Rename a note
export const renameNote = async (path: string, name: string) => {
	const storage = await getStorage();

	// Make sure file extension is included
	if (!name.endsWith(MARKDOWN_EXTENSION)) {
		name += MARKDOWN_EXTENSION;
	}

	// Remove breaking characters
	name = name.replace(/[/\\?%*:|"<>]/g, '');

	// An empty stem produces '.md', which would create a hidden file.
	if (name === MARKDOWN_EXTENSION) {
		throw new Error('Name cannot be empty');
	}

	const parentPath = path.split('/').slice(0, -1).join('/');

	// Read the directory
	const files = await storage.readDir(parentPath || '/');

	// Make sure there are no name conflicts
	if (files.some((file) => file.name?.toLowerCase() === name.toLowerCase() && !file.isDirectory)) {
		throw new Error('Name conflict');
	}

	// Rename the file
	await storage.rename(path, `${parentPath}/${name}`);
	appState.activeFile = `${parentPath}/${name}`;
};

// Save active note. The storage layer snapshots the previous contents into
// .tactile/versions first, so saves are never destructive. In source mode the
// raw buffer is what gets written; in edit/view mode the document is
// serialized to markdown first.
export const saveNote = async (path: string) => {
	if (!path || !appState.activeFile) return;
	const storage = await getStorage();

	// Get note content
	let content =
		appState.editorMode === 'source'
			? appState.sourceContent
			: (appState.editor.instance?.storage.markdown.getMarkdown() ?? '');

	// Remove the first heading title
	content = content.replace(/^# .*\n/, '');

	await storage.writeTextFile(path, content);
};

export const moveNote = async (source: string, target: string) => {
	const storage = await getStorage();

	// Get target directory
	let targetFiles: DirEntry[];
	try {
		targetFiles = await storage.readDir(target);
	} catch (error) {
		if (error instanceof StorageError && error.code === 'not_found') {
			targetFiles = [];
		} else {
			throw error;
		}
	}

	// Make sure there are no name conflicts. A directory with the same name
	// would also collide on backends that fall back to copy + delete.
	const noteName = source.split('/').pop()!;

	if (targetFiles.some((file) => file.name === noteName)) {
		throw new Error('Name conflict');
	}

	await storage.rename(source, `${target}/${noteName}`.replace('//', '/'));

	// Open the note
	openNote(target + '/' + noteName);
};

// Duplicate a note (format: "<name> (<number>).<ext>") - <number> is incremented if there are any existing notes with the same name
export const duplicateNote = async (path: string) => {
	const storage = await getStorage();

	// Fetch the content of the note
	const content = await storage.readTextFile(path);

	// Extract the name and extension of the note
	const name = path
		.split('/')
		.pop()!
		.split('.')
		.shift()!
		.replace(/\s\(\d+\)$/, '');
	const ext = path.split('.').pop()!;

	// Find the lowest free copy index. Counting existing copies breaks when
	// earlier copies were deleted, e.g. a.md, a (2).md -> new copy must not
	// overwrite a (2).md.
	const dir = path.split('/').slice(0, -1).join('/') || '/';
	const files = await storage.readDir(dir);
	const usedIndexes = new Set(
		files
			.map((file) =>
				file.name?.match(
					new RegExp(`^${escapeRegExp(name)} \\((\\d+)\\)\\.${escapeRegExp(ext)}$`, 'i')
				)
			)
			.filter((m): m is RegExpMatchArray => m !== null)
			.map((m) => parseInt(m[1]))
	);
	let index = 1;
	while (usedIndexes.has(index)) index++;

	// Write the new note
	const newName = `${name} (${index}).${ext}`;
	await storage.writeTextFile(`${dir}/${newName}`, content);

	// Open the new note
	openNote(`${dir}/${newName}`);
};

export const getNoteMetadataParams = async (path: string): Promise<NoteMetadataParams> => {
	const storage = await getStorage();

	// General file metadata
	const stat = await storage.stat(path);
	const fileMetadata = {
		createdAt: stat.birthtime ?? stat.mtime ?? new Date(0),
		modifiedAt: stat.mtime ?? new Date(0),
		size: stat.size
	};

	// Get editor metadata
	const editorWordCount = appState.editor.instance?.storage.characterCount.words() ?? 0;
	const editorCharacterCount = appState.editor.instance?.storage.characterCount.characters() ?? 0;

	// Calculate average reading time (in seconds if < 1min and in minutes if >= 1min)
	const avgReadingTime = calculateReadingTime(editorWordCount);

	return {
		fileMetadata,
		editorMetadata: {
			words: editorWordCount,
			characters: editorCharacterCount,
			avgReadingTime: avgReadingTime
		}
	};
};

// Version history for a note, newest first. Empty when the backend has no
// versioning support (should not happen: createBrowserBackend wraps it).
export const listNoteVersions = async (path: string): Promise<FileVersion[]> => {
	const storage = await getStorage();
	if (!isVersioned(storage)) return [];
	return storage.listVersions(normalizePath(path));
};

// Reads the stored contents of one version snapshot.
export const readNoteVersion = async (path: string, versionId: string): Promise<string> => {
	const storage = await getStorage();
	if (!isVersioned(storage)) throw new Error('Versioning is not available');
	return storage.readVersion(normalizePath(path), versionId);
};

// Reads the current on-disk contents of a note (used to diff a version
// against the latest state).
export const readNoteContent = async (path: string): Promise<string> => {
	const storage = await getStorage();
	return storage.readTextFile(normalizePath(path));
};

// Restores a note to an older version. The current contents are snapshotted
// first, so restore is itself undoable.
export const restoreNoteVersion = async (path: string, versionId: string): Promise<void> => {
	const storage = await getStorage();
	if (!isVersioned(storage)) throw new Error('Versioning is not available');
	await storage.restoreVersion(normalizePath(path), versionId);
	// Reload the editor if the restored note is open.
	if (appState.activeFile === path) {
		await openNote(path, true);
	}
};
