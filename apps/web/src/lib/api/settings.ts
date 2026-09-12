import { STORAGE_KEYS } from '@/constants';
import { db } from '@/database/client';
import { collectionSettings as collectionSettingsTable } from '@/database/schema';
import { appState } from '@/store.svelte';
import type { AppSettingsParams, CollectionSettingsParams } from '@/types';
import { eq } from 'drizzle-orm';

export const loadSettings = async (loadApp: boolean, loadCollection: boolean) => {
	if (loadApp) {
		// Load app settings from local storage
		const appSettingsData = window.localStorage.getItem(STORAGE_KEYS.appSettings);
		if (!appSettingsData) {
			setSettings('app');
		} else {
			appState.appSettings = JSON.parse(appSettingsData);
		}
	}

	if (loadCollection) {
		const collectionSettingsData = await db
			.select()
			.from(collectionSettingsTable)
			.where(eq(collectionSettingsTable.collectionPath, appState.collection!));
		if (!collectionSettingsData || collectionSettingsData.length === 0) {
			setSettings('collection');
		} else {
			appState.collectionSettings = {
				editor: collectionSettingsData[0].editor as CollectionSettingsParams['editor'],
				notes: collectionSettingsData[0].notes as CollectionSettingsParams['notes']
			};
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
		appState.collectionSettings = (value ??
			appState.collectionSettings) as CollectionSettingsParams;
		await db
			.insert(collectionSettingsTable)
			.values({
				collectionPath: appState.collection!,
				editor: ((value ?? appState.collectionSettings) as CollectionSettingsParams).editor,
				notes: ((value ?? appState.collectionSettings) as CollectionSettingsParams).notes
			})
			.onConflictDoUpdate({
				target: collectionSettingsTable.collectionPath,
				set: {
					editor: ((value ?? appState.collectionSettings) as CollectionSettingsParams).editor,
					notes: ((value ?? appState.collectionSettings) as CollectionSettingsParams).notes
				}
			});
	}
};
