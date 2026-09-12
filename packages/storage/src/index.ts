export * from './types';
export * from './paths';
export * from './events';
export * from './mutex';
export * from './opfs';
export * from './idbfs';
export * from './tauri';
export * from './versioned';
export * from './format';

import { IdbFsBackend } from './idbfs';
import { OpfsBackend } from './opfs';
import type { StorageBackend } from './types';
import { VersionedBackend, type VersioningOptions } from './versioned';

export function isOpfsAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

// Pick the best browser backend: OPFS where available, IndexedDB records
// otherwise. Wraps it with versioning unless disabled.
export function createBrowserBackend(options?: {
  rootName?: string;
  versioning?: false | VersioningOptions;
}): StorageBackend {
  const base: StorageBackend = isOpfsAvailable()
    ? new OpfsBackend(options?.rootName)
    : new IdbFsBackend();
  if (options?.versioning === false) return base;
  return new VersionedBackend(base, options?.versioning);
}
