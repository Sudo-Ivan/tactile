import type { CollectionSettingsParams, ShortcutParams } from './types';

export const SHORTCUTS: Record<string, ShortcutParams> = {
	'editor:toggle-mode': { command: true, key: 'e' },
	'editor:search': { command: true, key: 'f' },
	'command:open-note': { command: true, key: 'j' },
	'command:move-note': { command: true, shift: true, key: 'm' },
	'notes:search': { command: true, shift: true, key: 'f' },
	'notes:toggle-sidebar': { command: true, shift: true, key: 's' },
	'notes:toggle-details': { command: true, key: 'i' },
	'notes:history-back': { command: true, key: 'ArrowLeft', alt: true },
	'notes:history-forward': { command: true, key: 'ArrowRight', alt: true },
	'notes:create': { command: true, key: 'n' },
	'notes:create-folder': { command: true, shift: true, key: 'n' },
	'note:save': { command: true, key: 's' },
	'note:duplicate': { key: 'd', hover: true },
	'note:rename': { key: 'r', hover: true },
	'note:delete': { command: true, key: 'Backspace', hover: true },
	'note:copy-path': { command: true, key: 'c', shift: true },
	'folder:create': { key: 'f', hover: true },
	'folder:create-note': { key: 'n', hover: true },
	'folder:rename': { key: 'r', hover: true },
	'folder:show-in-folder': { shift: true, key: 'f', hover: true },
	'folder:delete': { command: true, key: 'Backspace', hover: true },
	'app:settings': { command: true, key: ',' },
	'app:shortcuts': { command: true, key: '/' },
	'app:help': { command: true, key: 'h', shift: true },
	'app:share': { command: true, key: 'l', shift: true },
	'app:open-collection': { command: true, key: 'o' },
	'settings:toggle-theme': { command: true, key: 't', shift: true }
};

export const BASE_APP_SETTINGS = {
	theme: 'dark',
	theme_mode: 'system',
	interface_font: 'system-ui'
};

export const BASE_COLLECTION_SETTINGS: CollectionSettingsParams = {
	editor: {
		font: 'system-ui',
		size: 14,
		auto_save: true,
		auto_save_debounce: 750,
		auto_correct: false,
		spell_check: false,
		show_inline_title: true,
		show_line_numbers: false,
		show_toolbar: true
	},
	notes: {
		trash_dir: 'system',
		excluded_files: []
	}
};

// App route paths
export const ROUTES = {
	notes: '/notes',
	daily: '/daily',
	tasks: '/tasks'
} as const;

// localStorage keys
export const STORAGE_KEYS = {
	appSettings: 'appSettings'
} as const;

// Default names and paths for new entries
export const UNTITLED_NAME = 'Untitled';
export const MARKDOWN_EXTENSION = '.md';
export const TACTILE_DIR = '.tactile';
export const DAILY_NOTES_DIR = `/${TACTILE_DIR}/daily`;
export const TRASH_DIR = `${TACTILE_DIR}/trash`;
export const COLLECTION_SETTINGS_PATH = `${TACTILE_DIR}/settings.json`;
export const COLLECTIONS_PATH = `/${TACTILE_DIR}/collections.json`;
export const DAILY_NOTE_NAME_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const TASK_MARKER = '- [ ]';

// Shared timing values in milliseconds
export const TIMING = {
	searchDebounce: 500,
	searchFocusDelay: 250,
	searchResultDelay: 300,
	renameFocusDelay: 50,
	folderRenameDelay: 100,
	tooltipGroupDelay: 500
} as const;

// Sidebar size and resize bounds in pixels
export const SIDEBAR = {
	defaultWidth: 210,
	minWidth: 210,
	maxWidth: 500,
	collapseThreshold: 100,
	pageCursorBounds: { min: 245, max: 550 },
	detailCursorBounds: { min: 245, max: 500 }
};

export const GITHUB_URL = 'https://github.com/Sudo-Ivan/tactile';
export const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues`;
export const GITHUB_SPONSOR_URL = 'https://github.com/sponsors/Sudo-Ivan';
