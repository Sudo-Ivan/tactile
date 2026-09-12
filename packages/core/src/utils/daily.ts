import type { FileEntry } from '../types';

// Date encoded in a daily-note file name (YYYY-MM-DD.*), or undefined when
// the name does not match the format.
export function dailyNoteDate(
	path: string
): { year: number; month: number; day: number } | undefined {
	const [year, month, day] = path.split('/').pop()!.split('.')[0].split('-').map(Number);
	if (isNaN(year) || isNaN(month) || isNaN(day)) return undefined;
	return { year, month, day };
}

// Group daily notes into upcoming/today/yesterday/thisWeek/thisMonth/older
// buckets, each sorted newest first.
export function groupDailyEntries(entries: FileEntry[]): Record<string, FileEntry[]> {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	const thisWeekStart = new Date(today);
	thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
	const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

	const grouped: Record<string, FileEntry[]> = {
		upcoming: [],
		today: [],
		yesterday: [],
		thisWeek: [],
		thisMonth: [],
		older: []
	};

	entries.forEach((entry) => {
		const date = dailyNoteDate(entry.path);

		if (!date) {
			// If the file name doesn't match the expected format, put it in 'older'
			grouped.older.push(entry);
			return;
		}

		const time = new Date(date.year, date.month - 1, date.day).getTime();

		if (time > today.getTime()) {
			grouped.upcoming.push(entry);
		} else if (time === today.getTime()) {
			grouped.today.push(entry);
		} else if (time >= yesterday.getTime()) {
			grouped.yesterday.push(entry);
		} else if (time >= thisWeekStart.getTime()) {
			grouped.thisWeek.push(entry);
		} else if (time >= thisMonthStart.getTime()) {
			grouped.thisMonth.push(entry);
		} else {
			grouped.older.push(entry);
		}
	});

	// Sort each group by date (newest first)
	Object.keys(grouped).forEach((key) => {
		grouped[key as keyof typeof grouped].sort((a, b) => {
			const dateA = dailyNoteDate(a.path);
			const dateB = dailyNoteDate(b.path);
			return (
				new Date(dateB?.year ?? 0, (dateB?.month ?? 1) - 1, dateB?.day ?? 1).getTime() -
				new Date(dateA?.year ?? 0, (dateA?.month ?? 1) - 1, dateA?.day ?? 1).getTime()
			);
		});
	});

	return grouped;
}
