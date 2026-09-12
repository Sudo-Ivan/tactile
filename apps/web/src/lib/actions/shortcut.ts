import type { Action } from 'svelte/action';

// Interface for shortcut parameters
export interface ShortcutParams {
	alt?: boolean;
	shift?: boolean;
	command?: boolean;
	key: string;
	code?: string;
	callback?: () => void;
	hover?: boolean;
	node?: HTMLElement;
}

// Registry for shortcuts
const shortcuts: ShortcutParams[] = [];

// Global event listener
if (typeof window !== 'undefined') {
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
}

// Action to register a shortcut on an element
const shortcut: Action<HTMLElement, ShortcutParams> = (node, params) => {
	let current = { ...params, node };
	shortcuts.push(current);

	return {
		update: (newParams: ShortcutParams) => {
			const index = shortcuts.indexOf(current);
			if (index > -1) {
				shortcuts.splice(index, 1);
			}
			current = { ...newParams, node };
			shortcuts.push(current);
		},
		destroy: () => {
			const index = shortcuts.indexOf(current);
			if (index > -1) {
				shortcuts.splice(index, 1);
			}
		}
	};
};

export default shortcut;
