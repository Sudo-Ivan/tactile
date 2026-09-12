import { APP_SETTINGS_FILENAME, COLLECTION_SETTINGS_PATH } from '@/constants';
import { appState } from '@/store.svelte';
import type { AppSettingsParams, CollectionSettingsParams } from '@/types';
import { BaseDirectory } from '@tauri-apps/api/path';
import { storage } from '@/storage';

export const loadSettings = async (loadApp: boolean, loadCollection: boolean) => {
	if (loadApp) {
		const appSettingsText = await storage
			.readTextFile(APP_SETTINGS_FILENAME, {
				baseDir: BaseDirectory.AppData
			})
			.catch(() => null);

		if (!appSettingsText) {
			setSettings('app');
		} else {
			appState.appSettings = JSON.parse(appSettingsText);
		}
	}

	if (loadCollection) {
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
		const appSettingsText = JSON.stringify(value ?? appState.appSettings);
		appState.appSettings = (value ?? appState.appSettings) as AppSettingsParams;
		await storage.writeTextFile(APP_SETTINGS_FILENAME, appSettingsText, {
			baseDir: BaseDirectory.AppData
		});
	}

	if (settingsType === 'collection') {
		const collectionSettingsPath = `${appState.collection}/${COLLECTION_SETTINGS_PATH}`;
		const collectionSettingsText = JSON.stringify(value ?? appState.collectionSettings);
		appState.collectionSettings = (value ??
			appState.collectionSettings) as CollectionSettingsParams;
		await storage.writeTextFile(collectionSettingsPath, collectionSettingsText);
	}
};
