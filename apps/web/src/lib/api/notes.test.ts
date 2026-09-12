import { appState } from '@/store.svelte';
import type { Editor } from '@tiptap/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory storage backend; only the surface notes.ts touches is stubbed.
const files = new Map<string, string>();
const writes: Array<[string, string]> = [];

vi.mock('@/storage', () => ({
	getStorage: async () => ({
		readTextFile: async (path: string) => {
			const content = files.get(path);
			if (content === undefined) throw new Error('not found');
			return content;
		},
		writeTextFile: async (path: string, content: string) => {
			writes.push([path, content]);
			files.set(path, content);
		},
		readDir: async () => [],
		mkdir: async () => {},
		rename: async () => {},
		remove: async () => {},
		stat: async () => ({ size: 0, mtime: new Date(0), birthtime: new Date(0) })
	})
}));

vi.mock('@/utils', () => ({
	calculateReadingTime: () => '1min',
	getNextUntitledName: () => 'Untitled.md',
	setEditorContent: vi.fn()
}));

vi.mock('@tactile/storage', () => ({
	isVersioned: () => false,
	normalizePath: (p: string) => p,
	StorageError: class StorageError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

vi.mock('./trash', () => ({ moveToTrash: vi.fn() }));

const { openNote, saveNote } = await import('./notes');
const { setEditorContent } = await import('@/utils');

// A stand-in editor that serializes a fixed document.
const fakeEditor = (markdown: string) =>
	({
		storage: { markdown: { getMarkdown: () => markdown } }
	}) as unknown as Editor;

describe('openNote', () => {
	beforeEach(() => {
		files.clear();
		writes.length = 0;
		vi.mocked(setEditorContent).mockClear();
		appState.activeFile = null;
		appState.noteHistory = [];
		appState.sourceContent = '';
		appState.editor.dirtyPath = null;
		appState.editor.saveGeneration = 0;
		appState.editor.instance = undefined;
	});

	it('loads content and sets the active file', async () => {
		files.set('/b.md', 'b content');
		appState.editor.instance = fakeEditor('b content');

		await openNote('/b.md');

		expect(appState.activeFile).toBe('/b.md');
		expect(appState.sourceContent).toBe('b content');
		expect(setEditorContent).toHaveBeenCalledWith('b content');
		expect(appState.noteHistory).toEqual(['/b.md']);
	});

	it('flushes pending edits to the previous note before switching', async () => {
		files.set('/a.md', 'a original');
		files.set('/b.md', 'b content');
		appState.activeFile = '/a.md';
		appState.editor.instance = fakeEditor('a edited');
		appState.editor.dirtyPath = '/a.md';

		await openNote('/b.md');

		expect(writes).toEqual([['/a.md', 'a edited']]);
		expect(appState.activeFile).toBe('/b.md');
		expect(appState.editor.dirtyPath).toBeNull();
	});

	it('does not write anything when nothing is dirty', async () => {
		files.set('/b.md', 'b content');
		appState.editor.instance = fakeEditor('whatever');

		await openNote('/b.md');

		expect(writes).toEqual([]);
	});
});

describe('saveNote', () => {
	beforeEach(() => {
		files.clear();
		writes.length = 0;
		appState.activeFile = null;
		appState.editor.instance = undefined;
		appState.editorMode = 'edit';
	});

	it('writes the serialized document to the given path', async () => {
		appState.activeFile = '/a.md';
		appState.editor.instance = fakeEditor('# Title\nbody');

		await saveNote('/a.md');

		expect(writes).toEqual([['/a.md', 'body']]);
	});

	it('does nothing without an active file or path', async () => {
		appState.editor.instance = fakeEditor('doc');
		await saveNote('');
		appState.activeFile = '/a.md';
		await saveNote('');
		expect(writes).toEqual([]);
	});
});
