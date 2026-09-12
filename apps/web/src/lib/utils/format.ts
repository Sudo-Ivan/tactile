import type { ShortcutParams } from '../types';

// Shortcut to string
export function shortcutToString(shortcut: ShortcutParams) {
	const keys = [];

	if (shortcut.command) keys.push('⌘');
	if (shortcut.alt) keys.push('⌥');
	if (shortcut.shift) keys.push('⇧');

	switch (shortcut.key) {
		case 'Backspace':
			keys.push('⌫');
			break;
		case 'Enter':
			keys.push('⏎');
			break;
		case 'Tab':
			keys.push('⇥');
			break;
		case 'Delete':
			keys.push('⌦');
			break;
		case 'Escape':
			keys.push('⎋');
			break;
		case 'ArrowUp':
			keys.push('↑');
			break;
		case 'ArrowDown':
			keys.push('↓');
			break;
		case 'ArrowLeft':
			keys.push('←');
			break;
		case 'ArrowRight':
			keys.push('→');
			break;
		default:
			keys.push(shortcut.key.toUpperCase());
			break;
	}

	return keys.join('');
}

// Function to calculate average reading time
export function calculateReadingTime(wordCount: number): string {
	const wordsPerMinute = 200;
	const totalSeconds = Math.round((wordCount / wordsPerMinute) * 60);

	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	if (minutes > 0) {
		return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
	} else {
		return `${seconds}s`;
	}
}

export function formatTimeAgo(date: Date | undefined) {
	if (!date) return '';

	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		return `${days} day${days > 1 ? 's' : ''} ago`;
	} else if (hours > 0) {
		return `${hours} hour${hours > 1 ? 's' : ''} ago`;
	} else if (minutes > 0) {
		return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
	} else {
		return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
	}
}

export function formatFileSize(bytes: number) {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

	const i = Math.floor(Math.log(bytes) / Math.log(k));

	// Adjust to start from 'Bytes'
	const sizeInUnit = bytes / Math.pow(k, i);

	if (i >= 3) {
		// Display with decimal places for GB or bigger
		return Math.ceil(sizeInUnit) + ' ' + sizes[i];
	} else {
		// Display without decimal places for Bytes, KB, and MB
		return Math.ceil(sizeInUnit) + ' ' + sizes[i];
	}
}
