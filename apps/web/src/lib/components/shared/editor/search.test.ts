// @vitest-environment jsdom
import { appState } from '@/store.svelte';
import { render, cleanup } from '@testing-library/svelte';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import EditorSearch from '@tactile/core/components/shared/editor/search.svelte';
import { SearchAndReplace } from '@tactile/core/components/shared/editor/extensions/searchAndReplace';

// The editor store is rewritten on every transaction to drive isActive
// reactivity. Regression test: an effect that reads `instance` while calling
// editor commands (which always dispatch a transaction in tiptap v3) must not
// reschedule itself - that caused effect_update_depth_exceeded.
describe('editor search', () => {
	let editor: Editor;

	beforeEach(() => {
		appState.editorSearchValue = '';
		appState.editorSearchActive = false;
		appState.editor.instance = undefined;
		editor = new Editor({
			element: document.createElement('div'),
			extensions: [StarterKit, SearchAndReplace],
			onTransaction: () => {
				appState.editor.instance = editor;
			}
		});
	});

	afterEach(() => {
		cleanup();
		editor.destroy();
		appState.editor.instance = undefined;
	});

	it('does not loop when the editor instance becomes available', () => {
		render(EditorSearch);
		expect(() => {
			appState.editor.instance = editor;
			flushSync();
		}).not.toThrow();
	});

	it('survives repeated transactions without a depth error', () => {
		render(EditorSearch);
		appState.editor.instance = editor;
		flushSync();
		expect(() => {
			for (let i = 0; i < 5; i++) {
				editor.commands.insertContent('x');
				flushSync();
			}
		}).not.toThrow();
	});
});
