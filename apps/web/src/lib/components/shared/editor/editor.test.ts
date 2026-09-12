// @vitest-environment jsdom
import { appState } from '@/store.svelte';
import { render, cleanup } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Editor from './editor.svelte';

vi.mock('@/api/notes', () => ({
	saveNote: vi.fn().mockResolvedValue(undefined)
}));

const { saveNote } = await import('@/api/notes');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('editor component', () => {
	beforeEach(() => {
		vi.mocked(saveNote).mockClear();
		appState.activeFile = '/note.md';
		appState.sourceContent = '';
		appState.editor.dirtyPath = null;
		appState.editor.saveGeneration = 0;
		appState.collectionSettings.editor.auto_save = true;
		appState.collectionSettings.editor.auto_save_debounce = 20;
	});

	afterEach(() => {
		cleanup();
		appState.editor.instance = undefined;
		appState.activeFile = null;
		appState.editor.dirtyPath = null;
	});

	it('exposes the tiptap instance on mount without duplicate extension warnings', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		render(Editor);
		await sleep(0);
		expect(appState.editor.instance).toBeTruthy();
		expect(
			warn.mock.calls.some((args) => String(args[0]).includes('Duplicate extension names'))
		).toBe(false);
		warn.mockRestore();
	});

	it('autosaves the active note once after the debounce', async () => {
		render(Editor);
		await sleep(0);
		appState.editor.instance!.commands.insertContent('hello');
		await sleep(60);
		expect(saveNote).toHaveBeenCalledTimes(1);
		expect(saveNote).toHaveBeenCalledWith('/note.md');
		await sleep(0);
		expect(appState.editor.dirtyPath).toBeNull();
	});

	it('does not save into a different note when activeFile changed mid-debounce', async () => {
		render(Editor);
		await sleep(0);
		appState.editor.instance!.commands.insertContent('hello');
		appState.editor.dirtyPath = '/other.md';
		appState.activeFile = '/other.md';
		await sleep(60);
		expect(saveNote).not.toHaveBeenCalled();
	});
});
