import type { ShortcutParams as BaseShortcutParams } from '@/types';
import type { Action } from 'svelte/action';

// Interface for shortcut parameters
export interface ShortcutParams extends BaseShortcutParams {
	callback?: () => void;
	node?: HTMLElement;
}

// Registry for shortcuts
const shortcuts: ShortcutParams[] = [];

// Global event listener
window.addEventListener('keydown', (e: KeyboardEvent) => {
	for (const shortcut of shortcuts) {
		if (
			!!shortcut.alt !== e.altKey ||
			!!shortcut.shift !== e.shiftKey ||
			!!shortcut.command !== (e.ctrlKey || e.metaKey) ||
			(shortcut.key.toLowerCase() !== e.key.toLowerCase() &&
				!(shortcut.code && shortcut.code === e.code)) ||
			(shortcut.hover && !(shortcut.node?.parentNode as Element)?.matches(':hover'))
		)
			continue;

		e.preventDefault();
		if (shortcut.callback) {
			shortcut.callback();
		} else {
			shortcut.node?.click();
		}
	}
});

// Action registering a shortcut while the node is mounted
const handleShortcut: Action<HTMLElement, ShortcutParams> = (node, params) => {
	params.node = node;
	shortcuts.push(params);

	return {
		destroy: () => {
			const index = shortcuts.indexOf(params);
			if (index > -1) {
				shortcuts.splice(index, 1);
			}
		}
	};
};

export default handleShortcut;
