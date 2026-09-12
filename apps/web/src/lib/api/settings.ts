import { COLLECTION_SETTINGS_PATH, STORAGE_KEYS } from '@/constants';
import { getStorage } from '@/storage';
import { appState } from '@/store.svelte';
import type { AppSettingsParams, CollectionSettingsParams } from '@/types';

export const loadSettings = async (loadApp: boolean, loadCollection: boolean) => {
	const storage = await getStorage();

	if (loadApp) {
		// Load app settings from local storage
		const appSettingsData = window.localStorage.getItem(STORAGE_KEYS.appSettings);
		if (!appSettingsData) {
			setSettings('app');
		} else {
			appState.appSettings = JSON.parse(appSettingsData);
		}
	}

	if (loadCollection && appState.collection) {
		const collectionSettingsPath = `${appState.collection}/${COLLECTION_SETTINGS_PATH}`;
		const collectionSettingsText = await storage
			.readTextFile(collectionSettingsPath)
			.catch(() => null);
		if (!collectionSettingsText) {
			setSettings('collection');
		} else {
			appState.collectionSettings = JSON.parse(collectionSettingsText);
		}
	}
};

export const setSettings = async (
	settingsType: 'app' | 'collection',
	value?: AppSettingsParams | CollectionSettingsParams
) => {
	if (settingsType === 'app') {
		appState.appSettings = (value ?? appState.appSettings) as AppSettingsParams;
		window.localStorage.setItem(
			STORAGE_KEYS.appSettings,
			JSON.stringify(value ?? appState.appSettings)
		);
	}
	if (settingsType === 'collection') {
		if (!appState.collection) return;
		const storage = await getStorage();
		appState.collectionSettings = (value ??
			appState.collectionSettings) as CollectionSettingsParams;
		await storage.writeTextFile(
			`${appState.collection}/${COLLECTION_SETTINGS_PATH}`,
			JSON.stringify(appState.collectionSettings),
			{ keepVersion: false }
		);
	}
};
