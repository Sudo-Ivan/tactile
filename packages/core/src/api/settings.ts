import { BASE_APP_SETTINGS, COLLECTION_SETTINGS_PATH } from '../constants';
import { platform } from '../platform';
import { appState } from '../state/app.svelte';
import { getStorage } from '../storage';
import type { AppSettingsParams, CollectionSettingsParams } from '../types';

export const loadSettings = async (loadApp: boolean, loadCollection: boolean) => {
	if (loadApp) {
		const appSettingsText = await Promise.resolve(platform().readAppSettings()).catch(() => null);

		if (!appSettingsText) {
			setSettings('app');
		} else {
			// Merge over defaults so keys added in later versions exist.
			appState.appSettings = { ...BASE_APP_SETTINGS, ...JSON.parse(appSettingsText) };
		}
	}

	if (loadCollection && appState.collection) {
		const storage = await getStorage();
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
		await platform().writeAppSettings(JSON.stringify(appState.appSettings));
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
