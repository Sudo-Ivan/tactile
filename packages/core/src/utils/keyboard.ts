import { appState } from '../state/app.svelte';
import type { ShortcutParams } from '../types';

// Shortcut to string. ⌘ is shown on macOS; on platforms where the OS is
// unknown (web) the macOS glyph is kept for historical consistency.
export function shortcutToString(shortcut: ShortcutParams) {
	const keys = [];
	const isDarwin = appState.platform === 'darwin' || appState.platform === undefined;

	if (shortcut.command) keys.push(isDarwin ? '⌘' : '⌃');
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

// Dispatch a synthetic keydown event to trigger registered shortcuts
export function dispatchShortcut(
	key: string,
	options: { metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}
) {
	document.dispatchEvent(
		new KeyboardEvent('keydown', {
			key,
			metaKey: options.metaKey ?? true,
			shiftKey: options.shiftKey ?? false,
			altKey: options.altKey ?? false
		})
	);
}
