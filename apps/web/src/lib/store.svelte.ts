import { EditorStore } from './components/shared/editor/editor-store.svelte';
import { BASE_APP_SETTINGS, BASE_COLLECTION_SETTINGS, SIDEBAR } from './constants';
import type {
	AppSettingsParams,
	CollectionSettingsParams,
	FileEntry,
	SettingsStateParams
} from './types';

export const appState = $state({
	activeFile: null as string | null,
	noteHistory: [] as string[],
	editor: new EditorStore(),
	editorMode: 'edit' as 'edit' | 'view' | 'source',
	sourceContent: '',
	noteDetailTab: 'metadata' as 'metadata' | 'toc' | 'history',
	editorSearchValue: '',
	editorSearchActive: false,
	collection: undefined as string | undefined,
	collectionEntries: [] as FileEntry[],
	tooltipsOpen: 0,
	collectionSearchActive: false,
	isPageSidebarOpen: true,
	pageSidebarWidth: SIDEBAR.defaultWidth,
	resizingPageSidebar: false,
	isNoteDetailSidebarOpen: false,
	noteDetailSidebarWidth: SIDEBAR.defaultWidth,
	resizingNoteDetailSidebar: false,
	settingsStore: { isOpen: false, activePage: 'general' } as SettingsStateParams,
	appSettings: BASE_APP_SETTINGS as AppSettingsParams,
	collectionSettings: BASE_COLLECTION_SETTINGS as CollectionSettingsParams
});
