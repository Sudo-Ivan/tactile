import { openNote } from '../api/notes';
import { SEARCH_RESULT_FOCUS_DELAY_MS, TASK_MARKER } from '../constants';
import { appState } from '../state/app.svelte';
import type { SearchResultParams } from '../types';
import { goToSearchResult } from '../utils/editor';

// After the target note is open, activate the editor's find panel, feed it
// the query and jump to the result at `index`. Delayed so the freshly
// opened editor has mounted.
function revealEditorResult(query: string, index: number) {
	setTimeout(() => {
		// set search active
		if (!appState.editorSearchActive) appState.editorSearchActive = true;

		// blur editor - this helps the search in focusing the result later
		appState.editor.instance?.commands.blur();

		// Feed the literal query to the editor's find; fuzzy-only matches
		// produce no editor results and just leave the note open.
		if (appState.editorSearchValue !== query) appState.editorSearchValue = query;

		const editor = appState.editor.instance;
		if (editor) {
			const found = editor.storage.searchAndReplace?.results?.[index];
			if (found) {
				goToSearchResult(editor, index);
				editor.commands.setSearchResult(index);
			}
		}
	}, SEARCH_RESULT_FOCUS_DELAY_MS);
}

// Open the note behind a collection search result. Content matches also
// light up the editor's find panel; name matches just open the note.
export function openSearchResult(
	path: string,
	result: SearchResultParams,
	query: string,
	index: number
) {
	if (result.kind === 'name') {
		openNote(path, true);
		return;
	}

	// set search term
	appState.editorSearchValue = '';

	// Open the file
	if (appState.activeFile !== path) {
		openNote(path, true);
	}

	revealEditorResult(query, index);
}

// Open the note behind a task list entry and jump the editor's find panel
// to the matched line. The search term is the task text without the marker.
export function openTaskResult(path: string, contextPreview: string, index: number) {
	appState.editorSearchValue = '';

	if (appState.activeFile !== path) {
		openNote(path, true);
	}

	const searchTerm = contextPreview.replaceAll(TASK_MARKER, '').trim();
	revealEditorResult(searchTerm, index);
}
