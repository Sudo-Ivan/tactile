// Shared domain types for the Tactile frontends (web + desktop).

// Pulls in the characterCount Storage augmentation declared by
// @tiptap/extensions through the character-count package.
import type {} from '@tiptap/extension-character-count';
import type { MarkdownStorage } from 'tiptap-markdown';

// tiptap-markdown augments the editor with a `markdown` storage bucket. The
// declaration lives here so both apps and this package see it; each app keeps
// its own `searchAndReplace` storage declaration for its local extension.
declare module '@tiptap/core' {
	interface Storage {
		markdown: MarkdownStorage;
	}
}

export interface ShortcutParams {
	alt?: boolean;
	shift?: boolean;
	command?: boolean;
	key: string;
	code?: string; // overwritting the key if set
	hover?: boolean;
}

export interface AppSettingsParams {
	theme: string;
	theme_mode: string;
	interface_font: string;
	// Custom Tactile Sync relay URL. Empty uses the default hosted relay.
	sync_server: string;
}

export interface CollectionSettingsParams {
	editor: {
		font: string;
		size: number;
		auto_save: boolean;
		auto_save_debounce: number;
		auto_correct: boolean;
		spell_check: boolean;
		show_inline_title: boolean;
		show_line_numbers: boolean;
		show_toolbar: boolean;
		word_wrap: boolean;
		line_length: 'full' | 'wide' | 'readable';
	};
	notes: {
		trash_dir: 'system' | 'tactile' | 'delete';
		excluded_files: string[];
	};
}

interface FileMetadataParams {
	createdAt: Date;
	modifiedAt: Date;
	size: number;
}

export interface NoteMetadataParams {
	fileMetadata: FileMetadataParams;
	editorMetadata: {
		words: number;
		characters: number;
		avgReadingTime: string;
	};
}

export interface SettingsStateParams {
	isOpen: boolean;
	activePage: string;
}

export interface CollectionParams {
	path: string;
	name: string;
	lastOpened: string;
}

// A file or directory in a collection tree. Directories carry a children
// array; files do not. The is* flags mirror plugin-fs DirEntry and are
// populated where the backend exposes them (always on desktop, on web where
// the entry came from a readDir result).
export interface FileEntry {
	/**
	 * Name of the directory/file
	 * can be undefined if the path terminates with `..`
	 */
	name?: string;
	path: string;
	isDirectory?: boolean;
	isFile?: boolean;
	isSymlink?: boolean;
	/** Children of this entry if it's a directory; undefined otherwise */
	children?: FileEntry[];
}

export interface SearchResultParams {
	path: string;
	context_preview: string;
	// 'name' results matched the file name; 'content' results matched a line.
	kind: 'name' | 'content';
	// 1-based line number of the match for content results.
	line?: number;
	// Ranking score, higher is better.
	score: number;
	// [start, end) UTF-16 ranges to highlight inside context_preview.
	highlights: [number, number][];
}

// UI theme preference. 'system' follows the OS (the desktop app calls this
// 'auto' historically; both mean the same thing).
export type ThemeMode = 'system' | 'light' | 'dark';

export type { FileVersion } from '@tactile/storage';
