import { invoke } from '@tauri-apps/api/core';
import { isMobile } from '../platform.svelte';
import { appState } from '../store.svelte';

// Show in folder
export async function showInFolder(path: string) {
	if (isMobile) return;
	await invoke('show_in_folder', { path });
}

// Name of the platform file manager, used for reveal-in-folder labels
export function fileManagerLabel() {
	return appState.platform === 'darwin'
		? 'Finder'
		: appState.platform === 'linux'
			? 'Files'
			: 'Explorer';
}
