import { MARKDOWN_EXTENSION, OS_TRASH_DIR, TRASH_DIR, UNTITLED_NAME } from '@/constants';
import { appState } from '@/store.svelte';
import type { NoteMetadataParams } from '@/types';
import { setEditorContent } from '@/utils/editor';
import { calculateReadingTime } from '@/utils/format';
import { getNextUntitledName } from '@/utils/fs';
import { homeDir } from '@tauri-apps/api/path';
import { readDir, readTextFile, remove, rename, stat, writeTextFile } from '@tauri-apps/plugin-fs';

// Create a new note
export const createNote = async (dirPath: string, name?: string) => {
	// Read the directory
	const files = await readDir(dirPath);

	// Generate a new name (Untitled.md, if there are any exiting Untitled notes, increment the number by 1)
	if (!name) {
		name = getNextUntitledName(files, UNTITLED_NAME, MARKDOWN_EXTENSION);
	}

	// Save the new note
	await writeTextFile(`${dirPath}/${name}`, '');

	// Open the note
	openNote(`${dirPath}/${name}`);
};

// Open a note
export async function openNote(path: string, skipHistory = false) {
	const fileContent = await readTextFile(path);
	setEditorContent(fileContent);
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
			await rename(
				path,
				`${await homeDir()}${OS_TRASH_DIR[appState.platform!]}${path.split('/').pop()!}`
			);
			break;
		case 'tactile':
			await rename(path, `${appState.collection}/${TRASH_DIR}/${path.split('/').pop()!}`);
			break;
		case 'delete':
			await remove(path);
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
	const files = await readDir(path.split('/').slice(0, -1).join('/'));

	// Make sure there are no name conflicts
	if (files.some((file) => file.name?.toLowerCase() === name.toLowerCase() && file.isFile)) {
		throw new Error('Name conflict');
	}

	// Rename the file
	await rename(path, `${path.split('/').slice(0, -1).join('/')}/${name}`);
	appState.activeFile = `${path.split('/').slice(0, -1).join('/')}/${name}`;
};

// Save active note
export const saveNote = async (path: string) => {
	// Get note content
	let content = appState.editor.instance.storage.markdown.getMarkdown();

	// Remove the first heading title
	content = content.replace(/^# .*\n/, '');

	await writeTextFile(path, content);
};

export const moveNote = async (source: string, target: string) => {
	// Get target directory
	const files = await readDir(target);

	// Make sure there are no name conflicts
	const noteName = source.split('/').pop()!;

	if (files.some((file) => file.name === noteName && file.isFile)) {
		throw new Error('Name conflict');
	}

	await rename(source, target + '/' + noteName);
	openNote(target + '/' + noteName);
};

// Duplicate a note (format: "<name> (<number>).<ext>") - <number> is incremented if there are any existing notes with the same name
export const duplicateNote = async (path: string) => {
	// Fetch the content of the note
	const content = await readTextFile(path);

	// Extract the name and extension of the note
	const name = path
		.split('/')
		.pop()!
		.split('.')
		.shift()!
		.replace(/\s\(\d+\)$/, '');
	const ext = path.split('.').pop()!;

	// Get current index of the note
	const files = await readDir(path.split('/').slice(0, -1).join('/'));
	const notes = files.filter((file) => file.name?.startsWith(name) && file.isFile);

	// Write the new note
	const newName = `${name} (${notes.length}).${ext}`;
	await writeTextFile(`${path.split('/').slice(0, -1).join('/')}/${newName}`, content);

	// Open the new note
	openNote(`${path.split('/').slice(0, -1).join('/')}/${newName}`);
};

export const getNoteMetadataParams = async (path: string): Promise<NoteMetadataParams> => {
	// General file metadata
	// v2 plugin-fs stat returns birthtime/mtime, map them to the old field names
	const fileInfo = await stat(path);
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
