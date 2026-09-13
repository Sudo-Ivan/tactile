import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { getPublicKeyAsync } from '@noble/ed25519';
import { SYNC_BLOB_TTL_SECONDS, SYNC_SERVER_PLACEHOLDER, TACTILE_DIR } from '../constants';
import { appState } from '../state/app.svelte';
import { syncState, type SyncStats } from '../state/sync.svelte';
import { getStorage } from '../storage';
import { isInternalPath, joinPath, parentPath, type StorageBackend } from '@tactile/storage';
import { getIdentity, setIdentitySeed } from './identity';
import { RelayClient, RelayError, type RelayInfo } from './relay';
import {
	base64ToBytes,
	base64UrlToBytes,
	bytesToBase64,
	bytesToBase64Url,
	bytesToUtf8,
	hexToBytes,
	utf8ToBytes
} from '../utils/encoding';
import { toast } from '../utils/toast';

// Tactile Sync engine.
//
// Devices that share one Ed25519 identity (paired via the sync code) share
// one blob namespace on the relay. The relay is blind: every blob is
// XChaCha20-Poly1305 ciphertext under a key derived from the identity seed,
// so only paired devices can read or write.
//
// Layout per synced collection:
//   manifest blob  id = sha256(MANIFEST_DOMAIN || collectionKey)
//                  encrypted JSON: { v, updated, files: { relPath: entry } }
//   file blob      id = sha256(FILE_DOMAIN || collectionKey || relPath || hash)
//                  nonce(24) || ciphertext (content-addressed, no overwrite)
//
// Deletions propagate through tombstone entries in the manifest. Orphaned
// file blobs are deleted after the new manifest lands; anything missed
// expires with the blob TTL.

const MANIFEST_DOMAIN = utf8ToBytes('tactile-sync/manifest/v1');
const FILE_DOMAIN = utf8ToBytes('tactile-sync/file/v1');
const ENC_INFO = utf8ToBytes('tactile-sync/enc/v1');
const NONCE_LEN = 24;
const SYNC_CODE_PREFIX = 'tactilesync1:';
const SYNC_STATE_FILE = `${TACTILE_DIR}/sync-state.json`;
// Tombstones older than this are pruned from the manifest.
const TOMBSTONE_PRUNE_MS = 30 * 24 * 3600 * 1000;
// Files larger than this are skipped (relay default cap is 64 MiB).
const MAX_FILE_BYTES = 64 << 20;

// One manifest file entry. h = sha256(plaintext) b64, m = mtime ms,
// s = size, b = blob id b64, d = tombstone flag.
interface RemoteFileEntry {
	h: string;
	m: number;
	s: number;
	b: string;
	d?: number;
}

interface Manifest {
	v: 1;
	updated: number;
	files: Record<string, RemoteFileEntry>;
}

interface LocalSyncState {
	v: 1;
	lastSync: number;
	files: Record<string, { h: string; b: string }>;
}

interface LocalFile {
	rel: string;
	abs: string;
	data: Uint8Array;
	hash: Uint8Array;
	size: number;
	mtime: number;
}

export interface SyncResult extends SyncStats {
	skipped: number;
	errors: string[];
}

function syncServerUrl(): string {
	const custom = appState.appSettings.sync_server?.trim();
	return custom || SYNC_SERVER_PLACEHOLDER;
}

function collectionKey(collection: string): string {
	// Collections pair by name across devices: /notes on the web app and
	// ~/Documents/notes on the desktop both key as "notes".
	const segments = collection.replace(/\/+$/, '').split('/');
	return segments[segments.length - 1] || 'collection';
}

function manifestId(key: string): Uint8Array {
	return sha256(new Uint8Array([...MANIFEST_DOMAIN, ...utf8ToBytes(key)]));
}

function fileBlobId(key: string, rel: string, hash: Uint8Array): Uint8Array {
	return sha256(
		new Uint8Array([...FILE_DOMAIN, ...utf8ToBytes(key), 0, ...utf8ToBytes(rel), 0, ...hash])
	);
}

function encrypt(key: Uint8Array, plaintext: Uint8Array): Uint8Array {
	const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
	const ct = xchacha20poly1305(key, nonce).encrypt(plaintext);
	const out = new Uint8Array(NONCE_LEN + ct.length);
	out.set(nonce, 0);
	out.set(ct, NONCE_LEN);
	return out;
}

function decrypt(key: Uint8Array, blob: Uint8Array): Uint8Array {
	const nonce = blob.subarray(0, NONCE_LEN);
	const ct = blob.subarray(NONCE_LEN);
	return xchacha20poly1305(key, nonce).decrypt(ct);
}

// Walk the collection into rel-path -> file. .tactile itself is internal,
// but its daily/ subtree holds real notes and is synced like any other.
async function walkCollection(
	storage: StorageBackend,
	collection: string,
	maxBytes: number
): Promise<Map<string, LocalFile>> {
	const out = new Map<string, LocalFile>();

	async function walk(absDir: string, relDir: string): Promise<void> {
		const entries = await storage.readDir(absDir).catch(() => []);
		for (const entry of entries) {
			const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
			const abs = joinPath(absDir, entry.name);
			if (entry.isDirectory) {
				// Descend into .tactile only to reach daily/; children are still
				// filtered by isInternalPath on the next level down.
				if (rel === TACTILE_DIR) {
					await walk(abs, rel);
				} else if (!entry.name.startsWith('.') && !isInternalPath(rel)) {
					await walk(abs, rel);
				}
				continue;
			}
			if (!entry.isFile || isInternalPath(rel)) continue;
			const stat = await storage.stat(abs).catch(() => null);
			if (stat && stat.size > maxBytes) continue;
			const data = await storage.readFile(abs).catch(() => null);
			if (data === null) continue;
			out.set(rel, {
				rel,
				abs,
				data,
				hash: sha256(data),
				size: data.length,
				mtime: stat?.mtime?.getTime() ?? 0
			});
		}
	}

	await walk(collection, '');
	return out;
}

async function loadLocalState(
	storage: StorageBackend,
	collection: string
): Promise<LocalSyncState> {
	try {
		const text = await storage.readTextFile(joinPath(collection, SYNC_STATE_FILE));
		const parsed = JSON.parse(text) as LocalSyncState;
		if (parsed?.v === 1 && parsed.files) return parsed;
	} catch {
		// Missing or corrupt state: start clean.
	}
	return { v: 1, lastSync: 0, files: {} };
}

async function saveLocalState(
	storage: StorageBackend,
	collection: string,
	state: LocalSyncState
): Promise<void> {
	await storage.writeTextFile(joinPath(collection, SYNC_STATE_FILE), JSON.stringify(state), {
		keepVersion: false,
		origin: 'sync'
	});
}

async function fetchManifest(
	client: RelayClient,
	key: Uint8Array,
	id: Uint8Array
): Promise<Manifest | null> {
	const blob = await client.get(id);
	if (!blob) return null;
	try {
		const parsed = JSON.parse(bytesToUtf8(decrypt(key, blob))) as Manifest;
		if (parsed?.v !== 1 || typeof parsed.files !== 'object') return null;
		return parsed;
	} catch {
		return null; // corrupt or written for another identity
	}
}

async function writeManifest(
	client: RelayClient,
	key: Uint8Array,
	id: Uint8Array,
	manifest: Manifest
): Promise<void> {
	await client.remove(id); // 404 fine
	await client.put(id, encrypt(key, utf8ToBytes(JSON.stringify(manifest))), SYNC_BLOB_TTL_SECONDS);
}

function conflictPath(rel: string, now: Date): string {
	const stamp = now.toISOString().replace('T', ' ').slice(0, 19).replaceAll(':', '-');
	const dot = rel.lastIndexOf('.');
	const slash = rel.lastIndexOf('/');
	return dot > slash
		? `${rel.slice(0, dot)} (conflict ${stamp})${rel.slice(dot)}`
		: `${rel} (conflict ${stamp})`;
}

// ---------------------------------------------------------------- pairing

// The sync code carries the Ed25519 identity seed. Whoever holds it signs
// and decrypts as this identity, so treat it like a password.
export async function exportSyncCode(): Promise<string> {
	const identity = await getIdentity();
	return SYNC_CODE_PREFIX + bytesToBase64Url(hexToBytes(identity.secretKeyHex));
}

// Import a sync code, replacing this device's identity. Returns the public
// key the device now syncs under.
export async function importSyncCode(code: string): Promise<string> {
	const trimmed = code.trim();
	if (!trimmed.startsWith(SYNC_CODE_PREFIX)) {
		throw new Error('Not a Tactile sync code');
	}
	let seed: Uint8Array;
	try {
		seed = base64UrlToBytes(trimmed.slice(SYNC_CODE_PREFIX.length));
	} catch {
		throw new Error('Sync code is malformed');
	}
	if (seed.length !== 32) {
		throw new Error('Sync code is malformed');
	}
	await setIdentitySeed(seed);
	const pub = await getPublicKeyAsync(seed);
	return Array.from(pub, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------------ sync

// Reachability + capability check used by the settings "Test connection"
// button. Returns the relay's /v1/info payload.
export async function testRelay(url?: string): Promise<RelayInfo> {
	const base = (url ?? syncServerUrl()).trim();
	const probe = new RelayClient(base, new Uint8Array(32), new Uint8Array(32));
	const info = await probe.info();
	syncState.relayInfo = {
		relayId: info.relay_id,
		version: info.version,
		usedPct: info.load?.storage_used_pct ?? 0
	};
	return info;
}

let syncing = false;

// Sync the active collection with the relay. Returns null when there is no
// open collection. Stats land in syncState for the UI.
export async function syncNow(): Promise<SyncResult | null> {
	const collection = appState.collection;
	if (!collection || syncing) return null;

	syncing = true;
	syncState.status = 'syncing';
	syncState.lastError = '';

	const result: SyncResult = {
		uploaded: 0,
		downloaded: 0,
		deletedLocal: 0,
		deletedRemote: 0,
		conflicts: 0,
		skipped: 0,
		errors: []
	};

	try {
		const identity = await getIdentity();
		const seed = hexToBytes(identity.secretKeyHex);
		const pub = base64ToBytes(identity.publicKeyBase64);
		const encKey = hkdf(sha256, seed, undefined, ENC_INFO, 32);
		const client = new RelayClient(syncServerUrl(), seed, pub);
		const info = await client.info().catch(() => null);
		const maxFile = Math.min(info?.max_blob_size ?? MAX_FILE_BYTES, MAX_FILE_BYTES);

		const storage = await getStorage();
		const key = collectionKey(collection);
		const mId = manifestId(key);

		const remote = (await fetchManifest(client, encKey, mId)) ?? {
			v: 1 as const,
			updated: 0,
			files: {}
		};
		const state = await loadLocalState(storage, collection);
		const locals = await walkCollection(storage, collection, maxFile);
		const now = Date.now();
		const nextFiles: Record<string, RemoteFileEntry> = { ...remote.files };
		const nextState: LocalSyncState = { v: 1, lastSync: now, files: {} };
		const staleBlobIds = new Set<string>();
		for (const e of Object.values(remote.files)) staleBlobIds.add(e.b);
		for (const e of Object.values(state.files)) staleBlobIds.add(e.b);

		const upload = async (l: LocalFile): Promise<RemoteFileEntry> => {
			const id = fileBlobId(key, l.rel, l.hash);
			await client.put(id, encrypt(encKey, l.data), SYNC_BLOB_TTL_SECONDS);
			result.uploaded++;
			return { h: bytesToBase64(l.hash), m: l.mtime || now, s: l.size, b: bytesToBase64(id) };
		};

		const download = async (r: RemoteFileEntry, rel: string): Promise<void> => {
			const data = await client.get(base64ToBytes(r.b));
			if (!data) throw new Error(`remote blob missing for ${rel}`);
			const abs = joinPath(collection, rel);
			await storage.mkdir(parentPath(abs), { recursive: true, origin: 'sync' });
			await storage.writeFile(abs, decrypt(encKey, data), { origin: 'sync' });
			result.downloaded++;
		};

		const paths = new Set<string>([...locals.keys(), ...Object.keys(remote.files)]);
		for (const rel of paths) {
			const l = locals.get(rel);
			const r = remote.files[rel];
			const s = state.files[rel];
			try {
				if (l && r && !r.d) {
					const lh = bytesToBase64(l.hash);
					if (lh === r.h) {
						nextFiles[rel] = r;
						nextState.files[rel] = { h: r.h, b: r.b };
						continue;
					}
					const localChanged = !s || s.h !== lh;
					const remoteChanged = !s || s.h !== r.h;
					if (localChanged && !remoteChanged) {
						nextFiles[rel] = await upload(l);
					} else if (remoteChanged && !localChanged) {
						await download(r, rel);
						nextFiles[rel] = r;
					} else if (localChanged && remoteChanged) {
						result.conflicts++;
						if (r.m > l.mtime) {
							// Remote wins; keep the local edits as a conflict copy.
							const copy = joinPath(collection, conflictPath(rel, new Date(now)));
							await storage.mkdir(parentPath(copy), {
								recursive: true,
								origin: 'sync'
							});
							await storage.writeFile(copy, l.data, { origin: 'sync' });
							await download(r, rel);
							nextFiles[rel] = r;
						} else {
							nextFiles[rel] = await upload(l);
						}
					} else {
						// Neither side changed since last sync but hashes differ:
						// cannot happen with consistent state; keep remote.
						result.skipped++;
						nextFiles[rel] = r;
					}
					nextState.files[rel] = { h: nextFiles[rel].h, b: nextFiles[rel].b };
				} else if (l && (!r || r.d)) {
					if (r?.d && s && s.h === bytesToBase64(l.hash)) {
						// Remote tombstone, untouched locally: apply the delete.
						await storage.remove(l.abs, { origin: 'sync' });
						nextFiles[rel] = r;
						result.deletedLocal++;
					} else {
						// New file, or locally changed after a remote delete.
						nextFiles[rel] = await upload(l);
						nextState.files[rel] = { h: nextFiles[rel].h, b: nextFiles[rel].b };
					}
				} else if (!l && r && !r.d) {
					if (s && s.h === r.h) {
						// Deleted locally, unchanged remotely: tombstone it.
						nextFiles[rel] = { ...r, d: 1, m: now };
						result.deletedRemote++;
					} else if (s) {
						// Deleted locally but changed remotely: remote wins, no
						// silent data loss.
						await download(r, rel);
						nextFiles[rel] = r;
						nextState.files[rel] = { h: r.h, b: r.b };
					} else {
						await download(r, rel);
						nextFiles[rel] = r;
						nextState.files[rel] = { h: r.h, b: r.b };
					}
				} else {
					// !l && (!r || r.d): nothing to do. Prune old tombstones and
					// drop unknown local-state entries.
					if (r?.d) {
						if (now - r.m > TOMBSTONE_PRUNE_MS) {
							delete nextFiles[rel];
						} else {
							nextFiles[rel] = r;
						}
					}
				}
			} catch (e) {
				result.errors.push(`${rel}: ${e instanceof Error ? e.message : String(e)}`);
			}
		}

		// Publish the new manifest, then drop file blobs nothing references.
		const nextManifest: Manifest = { v: 1, updated: now, files: nextFiles };
		await writeManifest(client, encKey, mId, nextManifest);

		const liveIds = new Set(Object.values(nextFiles).map((e) => e.b));
		for (const b64 of staleBlobIds) {
			if (liveIds.has(b64)) continue;
			await client.remove(base64ToBytes(b64)).catch(() => {});
		}

		await saveLocalState(storage, collection, nextState);

		syncState.status = result.errors.length > 0 ? 'error' : 'idle';
		syncState.lastOk = result.errors.length === 0;
		syncState.lastError = result.errors[0] ?? '';
		syncState.lastSyncAt = now;
		if (result.errors.length > 0) {
			toast.error('Sync finished with errors', new Error(result.errors[0]));
		} else {
			const changes =
				result.uploaded + result.downloaded + result.deletedLocal + result.deletedRemote;
			toast.success(
				changes > 0
					? `Sync complete: ${changes} change${changes === 1 ? '' : 's'}`
					: 'Sync complete: already up to date'
			);
		}
		syncState.stats = {
			uploaded: result.uploaded,
			downloaded: result.downloaded,
			deletedLocal: result.deletedLocal,
			deletedRemote: result.deletedRemote,
			conflicts: result.conflicts
		};
		return result;
	} catch (e) {
		syncState.status = 'error';
		syncState.lastOk = false;
		syncState.lastError = e instanceof RelayError ? e.message : String(e);
		syncState.lastSyncAt = Date.now();
		result.errors.push(syncState.lastError);
		toast.error('Sync failed', e);
		return result;
	} finally {
		syncing = false;
	}
}

// ------------------------------------------------------------ scheduling

let autoTimer: ReturnType<typeof setInterval> | null = null;
let bootTimer: ReturnType<typeof setTimeout> | null = null;

export function stopAutoSync(): void {
	if (autoTimer) clearInterval(autoTimer);
	if (bootTimer) clearTimeout(bootTimer);
	autoTimer = null;
	bootTimer = null;
}

// Start or restart the interval loop from the persisted app settings.
// Called by each app after settings load, and by the settings UI on change.
export function applySyncSettings(): void {
	stopAutoSync();
	const { sync_enabled, sync_interval_minutes } = appState.appSettings;
	if (!sync_enabled) return;
	const minutes = Math.max(1, sync_interval_minutes || 5);
	autoTimer = setInterval(() => void syncNow(), minutes * 60_000);
	// One early pass so a freshly opened app pulls remote changes without
	// waiting a full interval.
	bootTimer = setTimeout(() => void syncNow(), 5_000);
}
