import { createNote, openNote } from '../api/notes';
import { dailyNoteName } from '../api/daily';
import { DAILY_NOTE_RENDER_DELAY_MS } from '../constants';
import type { FileEntry } from '../types';

// Open the daily note for a calendar date, creating it first when missing.
// After opening, scroll the entry into view inside the sidebar list.
export const openDailyNote = async (
	date: { year: number; month: number; day: number } | undefined,
	dir: string,
	entries: FileEntry[]
) => {
	if (!date) return;

	const noteName = dailyNoteName(date.year, date.month, date.day);

	// Check if note exists, if not create it - else open it
	if (!entries.some((entry) => entry.path.includes(noteName))) {
		createNote(dir, noteName);
	} else {
		openNote(`${dir}/${noteName}`, true);
	}

	// Get note element by data-path
	let noteElement = document.querySelector(`[data-path="${dir}/${noteName}"]`);

	// If note element is not found, wait for it to be rendered
	if (!noteElement) {
		await new Promise((resolve) => setTimeout(resolve, DAILY_NOTE_RENDER_DELAY_MS));
	}

	// Get note element again - this is because if the note is newly created, it might not be rendered yet
	noteElement = document.querySelector(`[data-path="${dir}/${noteName}"]`);

	// Scroll to note element
	if (noteElement) {
		const rect = noteElement.getBoundingClientRect();
		const isAboveView = rect.top < 0;
		const isBelowView = rect.bottom > window.innerHeight;
		if (isAboveView || isBelowView) {
			// Smooth scroll doesn't seem to work well from bottom to top
			const behavior = isAboveView ? 'auto' : 'smooth';
			noteElement.scrollIntoView({ behavior, block: 'center' });
		}
	}
};
