import { setMode, userPrefersMode } from 'mode-watcher';

export function toggleTheme() {
	// Theme options
	const themes = ['system', 'light', 'dark'];

	// Current theme
	const currentTheme = userPrefersMode.current;

	// Get index of current theme
	const index = themes.indexOf(currentTheme);

	// Get next theme
	const nextTheme = themes[(index + 1) % themes.length] as 'system' | 'light' | 'dark';

	// Set the next theme
	setMode(nextTheme);
}
