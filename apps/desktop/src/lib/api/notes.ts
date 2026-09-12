import { MARKDOWN_EXTENSION, OS_TRASH_DIR, UNTITLED_NAME } from '@/constants';
import { appState } from '@/store.svelte';
import type { NoteMetadataParams } from '@/types';
import { setEditorContent } from '@/utils/editor';
import { calculateReadingTime } from '@/utils/format';
import { getNextUntitledName } from '@/utils/fs';
import { homeDir } from '@tauri-apps/api/path';
import { isVersioned, normalizePath, type FileVersion } from '@tactile/storage';
import { storage } from '@/storage';
import { moveToTrash } from './trash';

// Create a new note
export const createNote = async (dirPath: string, name?: string) => {
	// Read the directory
	const files = await storage.readDir(dirPath);

	// Generate a new name (Untitled.md, if there are any exiting Untitled notes, increment the number by 1)
	if (!name) {
		name = getNextUntitledName(files, UNTITLED_NAME, MARKDOWN_EXTENSION);
	}

	// Save the new note
	await storage.writeTextFile(`${dirPath}/${name}`, '');

	// Open the note
	openNote(`${dirPath}/${name}`);
};

// Open a note
export async function openNote(path: string, skipHistory = false) {
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

// Delete a note
export const deleteNote = async (path: string) => {
	switch (appState.collectionSettings.notes.trash_dir) {
		case 'system':
			await storage.rename(
				path,
				`${await homeDir()}${OS_TRASH_DIR[appState.platform!]}${path.split('/').pop()!}`
			);
			break;
		case 'tactile':
			await moveToTrash(path);
			break;
		case 'delete':
			await storage.remove(path);
			break;
	}
	appState.activeFile = null;
};

// Rename a note
export const renameNote = async (path: string, name: string) => {
	// Make sure file extension is included
	if (!name.endsWith(MARKDOWN_EXTENSION)) {
		name += MARKDOWN_EXTENSION;
	}

	// Remove breaking characters
	name = name.replace(/[/\\?%*:|"<>]/g, '');

	// Read the directory
	const files = await storage.readDir(path.split('/').slice(0, -1).join('/'));

	// Make sure there are no name conflicts
	if (files.some((file) => file.name?.toLowerCase() === name.toLowerCase() && file.isFile)) {
		throw new Error('Name conflict');
	}

	// Rename the file
	await storage.rename(path, `${path.split('/').slice(0, -1).join('/')}/${name}`);
	appState.activeFile = `${path.split('/').slice(0, -1).join('/')}/${name}`;
};

// Save active note. In source mode the raw buffer is written; otherwise the
// document is serialized to markdown first.
export const saveNote = async (path: string) => {
	// Get note content
	let content =
		appState.editorMode === 'source'
			? appState.sourceContent
			: appState.editor.instance.storage.markdown.getMarkdown();

	// Remove the first heading title
	content = content.replace(/^# .*\n/, '');

	await storage.writeTextFile(path, content);
};

export const moveNote = async (source: string, target: string) => {
	// Get target directory
	const files = await storage.readDir(target);

	// Make sure there are no name conflicts
	const noteName = source.split('/').pop()!;

	if (files.some((file) => file.name === noteName && file.isFile)) {
		throw new Error('Name conflict');
	}

	await storage.rename(source, target + '/' + noteName);
	openNote(target + '/' + noteName);
};

// Duplicate a note (format: "<name> (<number>).<ext>") - <number> is incremented if there are any existing notes with the same name
export const duplicateNote = async (path: string) => {
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

	// Get current index of the note
	const files = await storage.readDir(path.split('/').slice(0, -1).join('/'));
	const notes = files.filter((file) => file.name?.startsWith(name) && file.isFile);

	// Write the new note
	const newName = `${name} (${notes.length}).${ext}`;
	await storage.writeTextFile(`${path.split('/').slice(0, -1).join('/')}/${newName}`, content);

	// Open the new note
	openNote(`${path.split('/').slice(0, -1).join('/')}/${newName}`);
};

export const getNoteMetadataParams = async (path: string): Promise<NoteMetadataParams> => {
	// General file metadata
	// v2 plugin-fs stat returns birthtime/mtime, map them to the old field names
	const fileInfo = await storage.stat(path);
	const fileMetadata = {
		createdAt: fileInfo.birthtime ?? fileInfo.mtime ?? new Date(0),
		modifiedAt: fileInfo.mtime ?? new Date(0),
		size: fileInfo.size
	};

	// Get editor metadata
	const editorWordCount = appState.editor.instance.storage.characterCount.words();
	const editorCharacterCount = appState.editor.instance.storage.characterCount.characters();

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
// versioning support.
export const listNoteVersions = async (path: string): Promise<FileVersion[]> => {
	if (!isVersioned(storage)) return [];
	return storage.listVersions(normalizePath(path));
};

// Reads the stored contents of one version snapshot.
export const readNoteVersion = async (path: string, versionId: string): Promise<string> => {
	if (!isVersioned(storage)) throw new Error('Versioning is not available');
	return storage.readVersion(normalizePath(path), versionId);
};

// Reads the current on-disk contents of a note (used to diff a version
// against the latest state).
export const readNoteContent = async (path: string): Promise<string> => {
	return storage.readTextFile(normalizePath(path));
};

// Restores a version snapshot. The current contents are snapshotted first,
// so restoring is never destructive.
export const restoreNoteVersion = async (path: string, versionId: string) => {
	if (!isVersioned(storage)) throw new Error('Versioning is not available');
	await storage.restoreVersion(normalizePath(path), versionId);
	appState.editor.notifySaveEvent();
	openNote(normalizePath(path), true);
};
