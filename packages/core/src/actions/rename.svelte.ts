import { renameFolder } from '../api/folders';
import { openNote } from '../api/notes';
import {
	INLINE_TITLE_INPUT_ID,
	RENAME_INPUT_FOCUS_DELAY_MS,
	RENAME_SPAN_FOCUS_DELAY_MS
} from '../constants';
import { appState } from '../state/app.svelte';
import type { FileEntry } from '../types';

// Inline rename handling for sidebar entries. Notes are renamed through the
// editor inline title input, folders through a contenteditable span.
// BUG: Currently shortcuts prevent from typing when ur on hover fix that
export function createEntryRename() {
	let isRenaming = $state(false);

	async function renameNoteInline(entry: FileEntry) {
		// Open the note
		await openNote(entry.path);

		// Blur the editor
		appState.editor.instance?.commands.blur();

		// Get the inline title input (#inline-title-input)
		const inlineTitleInput = document.getElementById(
			INLINE_TITLE_INPUT_ID
		) as HTMLInputElement | null;

		// Focus the input and select all text
		window.setTimeout(() => {
			inlineTitleInput?.focus();
			inlineTitleInput?.select();
		}, RENAME_INPUT_FOCUS_DELAY_MS);

		// Add blur event listener to the input
		inlineTitleInput?.addEventListener('blur', async () => {
			// Set the isRenaming variable to false
			isRenaming = false;

			// Remove the blur event listener
			inlineTitleInput?.removeEventListener('blur', () => {});
		});
	}

	function renameFolderInline(entry: FileEntry) {
		// Get the element with the same data-path attribute as the current entry
		const element = document.querySelector(`[data-path="${entry.path}"]`);

		// Get the span within the div > button > div
		const span = element?.querySelector('span');

		// Set the contenteditable attribute to true
		window.setTimeout(() => {
			span?.setAttribute('contenteditable', 'true');

			// Focus the span
			span?.focus();

			// Select all text
			document.execCommand('selectAll');
		}, RENAME_SPAN_FOCUS_DELAY_MS);

		// Add blur event listener to the span
		span?.addEventListener('blur', () => {
			// Set the contenteditable attribute to false
			span?.setAttribute('contenteditable', 'false');

			// Rename the folder
			if (isRenaming) {
				renameFolder(entry.path, span?.textContent || '');
			}

			// Set the isRenaming variable to false
			isRenaming = false;

			// Remove the blur event listener
			span?.removeEventListener('blur', () => {});
		});

		// Add keydown event listener to the span
		span?.addEventListener('keydown', (event) => {
			// Check if the key pressed is the Enter key
			if (event.key === 'Enter') {
				// Prevent the default action
				event.preventDefault();

				// Remove the focus from the span
				span?.blur();
			} else if (event.key === 'Escape') {
				// Prevent the default action
				event.preventDefault();

				// Set the contenteditable attribute to false
				span?.setAttribute('contenteditable', 'false');

				// Set the isRenaming variable to false
				isRenaming = false;

				// Reset the text content of the span
				span.textContent = entry.name ?? '';

				// Remove the blur event listener
				span?.removeEventListener('blur', () => {});
			} else if (event.key === 'Space') {
				// Prevent the default action
				event.preventDefault();
				event.stopPropagation();
			}
		});
	}

	async function rename(entry: FileEntry, type: 'note' | 'folder') {
		// Set the isRenaming variable to true
		isRenaming = true;

		if (type === 'note') {
			await renameNoteInline(entry);
		} else {
			renameFolderInline(entry);
		}
	}

	return {
		get isRenaming() {
			return isRenaming;
		},
		rename
	};
}
