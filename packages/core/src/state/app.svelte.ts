import { BASE_APP_SETTINGS, BASE_COLLECTION_SETTINGS, SIDEBAR_MIN_WIDTH } from '../constants';
import type {
	AppSettingsParams,
	CollectionSettingsParams,
	FileEntry,
	SettingsStateParams,
	ThemeMode
} from '../types';
import { EditorStore } from './editor.svelte';

// Global app state shared by both frontends. A few fields are only used on
// one platform (collectionEntries on web, appTheme/platform on desktop) but
// keeping one shape lets api and utils code stay platform-agnostic.
//
// Write discipline: domain state (activeFile, noteHistory, sourceContent,
// editorMode, appSettings, collectionSettings, collectionEntries, editor
// lifecycle) is mutated only from src/api/* and the mutators below - the api
// functions are the app's actions. Pure view chrome (sidebar open/width and
// resizing flags, tooltipsOpen, settingsStore, collectionSearchActive,
// editorSearchValue/editorSearchActive, noteDetailTab) may still be written
// directly from components and commands. Components read appState freely;
// they should never write domain fields.
export const appState = $state({
	activeFile: null as string | null,
	noteHistory: [] as string[],
	editor: new EditorStore(),
	editorMode: 'edit' as 'edit' | 'view' | 'source',
	sourceContent: '',
	noteDetailTab: 'metadata' as 'metadata' | 'toc' | 'history' | 'graph',
	editorSearchValue: '',
	editorSearchActive: false,
	collection: undefined as string | undefined,
	collectionEntries: [] as FileEntry[],
	tooltipsOpen: 0,
	collectionSearchActive: false,
	isPageSidebarOpen: true,
	pageSidebarWidth: SIDEBAR_MIN_WIDTH,
	resizingPageSidebar: false,
	isNoteDetailSidebarOpen: false,
	noteDetailSidebarWidth: SIDEBAR_MIN_WIDTH,
	resizingNoteDetailSidebar: false,
	settingsStore: { isOpen: false, activePage: 'general' } as SettingsStateParams,
	// Shortcuts sheet in the footer; commands flip this to open it.
	shortcutsOpen: false,
	// Desktop theme preference ('system' follows the OS). Web uses
	// mode-watcher instead and ignores this field.
	appTheme: 'system' as ThemeMode,
	// Host OS on desktop; stays undefined on web.
	platform: undefined as 'darwin' | 'linux' | 'windows' | undefined,
	appSettings: BASE_APP_SETTINGS as AppSettingsParams,
	collectionSettings: BASE_COLLECTION_SETTINGS as CollectionSettingsParams
});

// Mutators for the desktop-only fields. Kept next to the state they write
// so app shells never poke appState fields directly.
export function setAppTheme(mode: ThemeMode) {
	appState.appTheme = mode;
}

export function setPlatform(os: 'darwin' | 'linux' | 'windows') {
	appState.platform = os;
}
