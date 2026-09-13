// Reactive status for Tactile Sync, written by api/sync and read by the
// settings page and the footer indicator.

import { SvelteDate } from 'svelte/reactivity';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface SyncStats {
	uploaded: number;
	downloaded: number;
	deletedLocal: number;
	deletedRemote: number;
	conflicts: number;
}

export const syncState = $state({
	status: 'idle' as SyncStatus,
	// Unix ms of the last completed sync attempt, successful or not.
	lastSyncAt: null as number | null,
	// True when the last completed sync finished without errors.
	lastOk: false,
	lastError: '',
	stats: null as SyncStats | null,
	// Devices currently sharing this identity is unknowable from REST;
	// relayInfo is filled by the "Test connection" action.
	relayInfo: null as { relayId: string; version: number; usedPct: number } | null
});

export function syncStatusText(): string {
	if (syncState.status === 'syncing') return 'Syncing...';
	if (syncState.status === 'error') return syncState.lastError || 'Sync failed';
	if (!syncState.lastSyncAt) return 'Never synced';
	const d = new SvelteDate(syncState.lastSyncAt);
	return `Last synced ${d.toLocaleString()}`;
}
