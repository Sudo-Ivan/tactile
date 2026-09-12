// Shared storage primitives for all Tactile frontends.
//
// A StorageBackend presents a hierarchical text-file filesystem. The web app
// backs it with OPFS (or IndexedDB as a fallback), the desktop app with the
// real filesystem through the Tauri plugin, and the sync layer writes through
// the same surface so change events and versioning work uniformly.

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
}

export interface FileStat {
  size: number;
  mtime: Date | null;
  birthtime: Date | null;
}

export type ChangeKind = 'create' | 'write' | 'delete' | 'rename';

// local: written by this client. sync: applied from a remote device through
// the relay. remote: observed on the underlying fs by an outside watcher.
export type ChangeOrigin = 'local' | 'sync' | 'external';

export interface ChangeEvent {
  path: string;
  kind: ChangeKind;
  origin: ChangeOrigin;
  // For rename events, the previous path.
  oldPath?: string;
}

// Options are backend-specific extras. The Tauri adapter honours baseDir.
// WriteFileOptions.keepVersion is honoured by VersionedBackend.
export interface BackendOptions {
  baseDir?: number;
  keepVersion?: boolean;
  recursive?: boolean;
  // ChangeOrigin tag to attribute to emitted events. Defaults to local.
  origin?: ChangeOrigin;
}

export type Unsubscribe = () => void;

export interface StorageBackend {
  readonly name: string;

  readDir(path: string, options?: BackendOptions): Promise<DirEntry[]>;
  readTextFile(path: string, options?: BackendOptions): Promise<string>;
  readFile(path: string, options?: BackendOptions): Promise<Uint8Array>;
  writeTextFile(path: string, contents: string, options?: BackendOptions): Promise<void>;
  writeFile(path: string, contents: Uint8Array, options?: BackendOptions): Promise<void>;
  mkdir(path: string, options?: BackendOptions): Promise<void>;
  rename(from: string, to: string, options?: BackendOptions): Promise<void>;
  remove(path: string, options?: BackendOptions): Promise<void>;
  stat(path: string, options?: BackendOptions): Promise<FileStat>;
  exists(path: string, options?: BackendOptions): Promise<boolean>;

  // Subscribe to change events. Returns an unsubscribe function.
  onDidChange(cb: (event: ChangeEvent) => void): Unsubscribe;
}

// A single stored revision of a file.
export interface FileVersion {
  id: string;
  timestamp: number;
  size: number;
}

export interface VersionedStorageBackend extends StorageBackend {
  listVersions(path: string): Promise<FileVersion[]>;
  readVersion(path: string, id: string): Promise<string>;
  // Restores the file to the given version. The current contents are kept
  // as a new version, so restore is non-destructive.
  restoreVersion(path: string, id: string): Promise<void>;
}

export function isVersioned(backend: StorageBackend): backend is VersionedStorageBackend {
  return (
    typeof (backend as VersionedStorageBackend).listVersions === 'function' &&
    typeof (backend as VersionedStorageBackend).readVersion === 'function'
  );
}
