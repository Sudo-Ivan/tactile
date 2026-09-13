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

// File and directory names. The web app stores everything inside a virtual
// FS root and uses absolute-looking paths ('/.tactile/...'); the desktop app
// works on real filesystem paths, where the same names appear relative to a
// collection root. Both spellings are kept because existing call sites and
// stored data rely on them.
export const TACTILE_DIR = '.tactile';
export const TRASH_DIR = `${TACTILE_DIR}/trash`;
export const COLLECTION_SETTINGS_PATH = `${TACTILE_DIR}/settings.json`;
// Absolute-style variants used by the browser backend.
export const DAILY_NOTES_DIR = `/${TACTILE_DIR}/daily`;
export const COLLECTIONS_PATH = `/${TACTILE_DIR}/collections.json`;
// Collection-relative variants used by the real-fs backend.
export const DAILY_DIR = `${TACTILE_DIR}/daily`;
export const COLLECTIONS_FILENAME = 'collections.json';
export const APP_SETTINGS_FILENAME = 'settings.json';
// Desktop stores the Ed25519 identity seed in the app data dir.
export const IDENTITY_FILENAME = 'identity.key';

export const UNTITLED_NAME = 'Untitled';
export const MARKDOWN_EXTENSION = '.md';
export const DAILY_NOTE_NAME_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const TASK_MARKER = '- [ ]';

// This is from home dir (desktop only: used by the 'system' trash option).
export const OS_TRASH_DIR = {
	darwin: '.trash/',
	linux: '.local/share/Trash/files/',
	windows: '$Recycle.Bin/'
};

// App route paths, used with resolve() from $app/paths
export const ROUTES = {
	notes: '/notes',
	daily: '/daily',
	tasks: '/tasks'
} as const;
export type AppRoutePath = (typeof ROUTES)[keyof typeof ROUTES];

// localStorage keys
export const STORAGE_KEYS = {
	appSettings: 'appSettings',
	identity: 'tactile.identity'
} as const;

// Shared timing values in milliseconds. The flat *_MS exports are the
// canonical names; the TIMING object mirrors them for older call sites.
export const SEARCH_DEBOUNCE_MS = 500;
export const SEARCH_INPUT_FOCUS_DELAY_MS = 250;
export const SEARCH_RESULT_FOCUS_DELAY_MS = 300;
export const RENAME_INPUT_FOCUS_DELAY_MS = 50;
export const RENAME_SPAN_FOCUS_DELAY_MS = 100;
export const TOOLTIP_GROUP_DELAY_MS = 500;

// How long a trashed-item row stays in its pending "undo" state.
export const TRASH_PENDING_TIMEOUT_MS = 4000;

// Delay before re-querying a freshly created daily note's DOM node, giving
// the sidebar a chance to render it.
export const DAILY_NOTE_RENDER_DELAY_MS = 150;

// Choices offered in settings for the editor auto-save debounce.
export const AUTO_SAVE_DEBOUNCE_OPTIONS = [250, 500, 750, 1000, 1500, 2000, 3000] as const;

// Placeholder shown in the Tactile Sync server input.
export const SYNC_SERVER_PLACEHOLDER = 'https://sync.tactile.app';

export const TIMING = {
	searchDebounce: SEARCH_DEBOUNCE_MS,
	searchFocusDelay: SEARCH_INPUT_FOCUS_DELAY_MS,
	searchResultDelay: SEARCH_RESULT_FOCUS_DELAY_MS,
	renameFocusDelay: RENAME_INPUT_FOCUS_DELAY_MS,
	folderRenameDelay: RENAME_SPAN_FOCUS_DELAY_MS,
	tooltipGroupDelay: TOOLTIP_GROUP_DELAY_MS
} as const;

// Sidebar size and resize bounds in pixels. The flat SIDEBAR_* exports are
// the canonical names; the SIDEBAR object mirrors them for older call sites.
export const SIDEBAR_MIN_WIDTH = 210;
export const SIDEBAR_MAX_WIDTH = 500;
export const SIDEBAR_COLLAPSE_THRESHOLD = 100;
export const SIDEBAR_CURSOR_MIN_OFFSET = 245;
export const SIDEBAR_CURSOR_MAX_OFFSET = 550;
export const SIDEBAR_DETAIL_CURSOR_MAX_OFFSET = 500;

export const SIDEBAR = {
	defaultWidth: SIDEBAR_MIN_WIDTH,
	minWidth: SIDEBAR_MIN_WIDTH,
	maxWidth: SIDEBAR_MAX_WIDTH,
	collapseThreshold: SIDEBAR_COLLAPSE_THRESHOLD,
	pageCursorBounds: { min: SIDEBAR_CURSOR_MIN_OFFSET, max: SIDEBAR_CURSOR_MAX_OFFSET },
	detailCursorBounds: { min: SIDEBAR_CURSOR_MIN_OFFSET, max: SIDEBAR_DETAIL_CURSOR_MAX_OFFSET }
};

// z-index of the drag preview element appended to <body> during note drags.
export const DRAG_PREVIEW_Z_INDEX = 100;

// DOM element ids shared across components
export const INLINE_TITLE_INPUT_ID = 'inline-title-input';
export const NOTES_SEARCH_INPUT_ID = 'notesSearch';
export const EDITOR_SEARCH_INPUT_ID = 'editorSearch';

// External links
export const GITHUB_REPO_URL = 'https://github.com/Sudo-Ivan/tactile';
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`;
export const GITHUB_SPONSOR_URL = 'https://github.com/sponsors/Sudo-Ivan';
