import type { Action } from 'svelte/action';
import type { ShortcutParams as BaseShortcutParams } from '../types';

// Interface for shortcut parameters
export interface ShortcutParams extends BaseShortcutParams {
	callback?: () => void;
	node?: HTMLElement;
}

// Registry for shortcuts
const shortcuts: ShortcutParams[] = [];

// Hover shortcuts are unmodified keys meant for the hovered sidebar entry
// (d to duplicate, r to rename, ...). They must not fire while the user is
// typing anywhere, or the keypress is swallowed and the action runs.
function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return (
		target.isContentEditable ||
		target.tagName === 'INPUT' ||
		target.tagName === 'TEXTAREA' ||
		target.tagName === 'SELECT'
	);
}

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
				(shortcut.hover && !(shortcut.node?.parentNode as Element)?.matches(':hover')) ||
				(shortcut.hover && isEditableTarget(e.target))
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
