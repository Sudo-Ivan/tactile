import { createEditorStore } from './components/shared/editor/editor-store.svelte';
import { BASE_APP_SETTINGS, BASE_COLLECTION_SETTINGS, SIDEBAR_MIN_WIDTH } from './constants';
import type { AppSettingsParams, CollectionSettingsParams, SettingsStateParams } from './types';

export const appState = $state({
	activeFile: null as string | null,
	noteHistory: [] as string[],
	editorMode: 'edit' as 'edit' | 'view',
	editorSearchValue: '',
	editorSearchActive: false,
	collection: undefined as string | undefined,
	tooltipsOpen: 0,
	collectionSearchActive: false,
	isPageSidebarOpen: true,
	pageSidebarWidth: SIDEBAR_MIN_WIDTH,
	resizingPageSidebar: false,
	isNoteDetailSidebarOpen: false,
	noteDetailSidebarWidth: SIDEBAR_MIN_WIDTH,
	resizingNoteDetailSidebar: false,
	settingsStore: { isOpen: false, activePage: 'general' } as SettingsStateParams,
	appTheme: 'auto' as 'auto' | 'light' | 'dark',
	appSettings: BASE_APP_SETTINGS as AppSettingsParams,
	collectionSettings: BASE_COLLECTION_SETTINGS as CollectionSettingsParams,
	platform: undefined as 'darwin' | 'linux' | 'windows' | undefined,
	editor: createEditorStore()
});
