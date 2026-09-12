import type { ThemeMode } from '../types';

// Theme cycle order shared by both apps. 'system' follows the OS theme.
export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

// Next theme in the cycle. Each app applies it through its own mechanism
// (mode-watcher on web, appState + tauri setTheme on desktop).
export function nextTheme(current: ThemeMode): ThemeMode {
	const index = THEME_MODES.indexOf(current);
	return THEME_MODES[(index + 1) % THEME_MODES.length];
}
