// Local replacement for the v1 FileEntry type which does not exist in the
// v2 plugin-fs API. DirEntry there has no path or children fields, so the
// recursive tree shape is built by the app itself.
export interface FileEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	isFile: boolean;
	isSymlink: boolean;
	children?: FileEntry[];
}

// Local replacement for the removed tauri-plugin-fs-extra-api Metadata type.
// The v2 plugin-fs stat call returns FileInfo with birthtime and mtime fields
// which get mapped onto these names in getNoteMetadataParams.

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
	};
	notes: {
		trash_dir: 'system' | 'tactile' | 'delete';
		excluded_files: string[];
	};
}

export interface CollectionParams {
	path: string;
	name: string;
	lastOpened: string;
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
