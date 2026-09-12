export * from './types';
export * from './paths';
export * from './events';
export * from './mutex';
export * from './opfs';
export * from './idbfs';
export * from './tauri';
export * from './broadcast';
export * from './versioned';
export * from './format';

import { BroadcastBackend } from './broadcast';
import { IdbFsBackend } from './idbfs';
import { OpfsBackend } from './opfs';
import type { StorageBackend } from './types';
import { VersionedBackend, type VersioningOptions } from './versioned';

export function isOpfsAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

// Pick the best browser backend: OPFS where available, IndexedDB records
// otherwise. The broadcast wrapper gives every tab live change events even
// though OPFS has no watcher, and versioning wraps the result. Write path:
// VersionedBackend -> BroadcastBackend -> base, so snapshot writes broadcast
// like any other change.
export function createBrowserBackend(options?: {
  rootName?: string;
  versioning?: false | VersioningOptions;
}): StorageBackend {
  const base: StorageBackend = isOpfsAvailable()
    ? new OpfsBackend(options?.rootName)
    : new IdbFsBackend();
  const broadcast = new BroadcastBackend(base, options?.rootName);
  if (options?.versioning === false) return broadcast;
  return new VersionedBackend(broadcast, options?.versioning);
}
