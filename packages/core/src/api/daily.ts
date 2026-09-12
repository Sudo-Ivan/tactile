import { DAILY_DIR, MARKDOWN_EXTENSION } from '../constants';
import type { FileEntry } from '../types';
import { createNote } from './notes';

// Path of the daily-notes directory inside a collection. Both backends end
// up with '<collection>/.tactile/daily'.
export const dailyDir = (collection: string) => `${collection}/${DAILY_DIR}`;

// Name of the daily note for a date (YYYY-MM-DD.md).
export const dailyNoteName = (year: number, month: number, day: number) =>
	`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}${MARKDOWN_EXTENSION}`;

// Name of today's daily note.
export const todayNoteName = () => {
	const [year, month, day] = new Date().toISOString().split('T')[0].split('-').map(Number);
	return dailyNoteName(year, month, day);
};

// Create today's daily note when it does not exist yet. Returns today's
// note name either way.
export const ensureTodayDailyNote = async (dir: string, entries: FileEntry[]) => {
	const today = new Date().toISOString().split('T')[0];
	const noteName = `${today}${MARKDOWN_EXTENSION}`;

	if (!entries.some((entry) => entry.path.includes(today))) {
		await createNote(dir, noteName);
	}

	return noteName;
};
