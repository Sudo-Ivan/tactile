import type { CollectionSettingsParams, ShortcutParams } from './types';

export const SHORTCUTS: Record<string, ShortcutParams> = {
	'editor:toggle-mode': { command: true, key: 'e' },
	'editor:source-mode': { command: true, shift: true, key: 'e' },
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
	'note:show-in-folder': { shift: true, key: 'f', hover: true },
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
	interface_font: 'system-ui',
	sync_server: ''
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

// This is from home dir
export const OS_TRASH_DIR = {
	darwin: '.trash/',
	linux: '.local/share/Trash/files/',
	windows: '$Recycle.Bin/'
};

// File and directory names
export const COLLECTIONS_FILENAME = 'collections.json';
export const APP_SETTINGS_FILENAME = 'settings.json';
export const TACTILE_DIR = '.tactile';
export const DAILY_DIR = `${TACTILE_DIR}/daily`;
export const TRASH_DIR = `${TACTILE_DIR}/trash`;
export const COLLECTION_SETTINGS_PATH = `${TACTILE_DIR}/settings.json`;
export const MARKDOWN_EXTENSION = '.md';
export const UNTITLED_NAME = 'Untitled';

// Route paths, used with resolve() from $app/paths
export const ROUTES = {
	notes: '/notes',
	daily: '/daily',
	tasks: '/tasks'
} as const;
export type AppRoutePath = (typeof ROUTES)[keyof typeof ROUTES];

// Sidebar resize bounds
export const SIDEBAR_MIN_WIDTH = 210;
export const SIDEBAR_MAX_WIDTH = 500;
export const SIDEBAR_COLLAPSE_THRESHOLD = 100;
export const SIDEBAR_CURSOR_MIN_OFFSET = 245;
export const SIDEBAR_CURSOR_MAX_OFFSET = 550;

// Timing defaults
export const SEARCH_DEBOUNCE_MS = 500;
export const SEARCH_INPUT_FOCUS_DELAY_MS = 250;
export const SEARCH_RESULT_FOCUS_DELAY_MS = 300;
export const RENAME_INPUT_FOCUS_DELAY_MS = 50;
export const RENAME_SPAN_FOCUS_DELAY_MS = 100;

// External links
export const GITHUB_REPO_URL = 'https://github.com/Sudo-Ivan/tactile';
export const GITHUB_ISSUES_URL = 'https://github.com/Sudo-Ivan/tactile/issues';
export const GITHUB_SPONSOR_URL = 'https://github.com/sponsors/Sudo-Ivan';

// DOM element ids shared across components
export const INLINE_TITLE_INPUT_ID = 'inline-title-input';
export const NOTES_SEARCH_INPUT_ID = 'notesSearch';
export const EDITOR_SEARCH_INPUT_ID = 'editorSearch';

// Tauri command and event names
export const SEARCH_FILES_COMMAND = 'search_files';
export const WINDOW_THEME_EVENT = 'tactile-bg-changed';
