import { EventedBackend } from './events';
import { KeyedMutex } from './mutex';
import {
  StorageError,
  baseName,
  isRoot,
  isUnder,
  normalizePath,
  parentPath,
  pathSegments
} from './paths';
import type { BackendOptions, ChangeOrigin, DirEntry, FileStat, StorageBackend } from './types';

interface EntryRecord {
  path: string;
  parent: string;
  kind: 'file' | 'dir';
  data: string | Uint8Array;
  size: number;
  mtime: number;
  ctime: number;
}

const DB_NAME = 'tactile-fs';
const DB_VERSION = 1;
const STORE = 'entries';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Fallback backend for browsers without OPFS. Records live in a single
// IndexedDB object store keyed by absolute path with a parent index for
// listings. Multi-record mutations (recursive remove, dir rename) run in one
// transaction so they cannot half-apply.
//
// Same change-event caveat as OpfsBackend: events only cover writes made
// through this instance.
export class IdbFsBackend extends EventedBackend implements StorageBackend {
  readonly name = 'idbfs';

  private dbPromise: Promise<IDBDatabase> | null = null;
  private mutex = new KeyedMutex();

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          const store = db.createObjectStore(STORE, { keyPath: 'path' });
          store.createIndex('parent', 'parent', { unique: false });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      this.dbPromise.catch(() => {
        this.dbPromise = null;
      });
    }
    return this.dbPromise;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.open();
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  private async getRecord(path: string): Promise<EntryRecord | undefined> {
    const store = await this.store('readonly');
    return requestToPromise(store.get(path) as IDBRequest<EntryRecord | undefined>);
  }

  private async listChildren(path: string): Promise<EntryRecord[]> {
    const db = await this.open();
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('parent');
    return requestToPromise(index.getAll(path) as IDBRequest<EntryRecord[]>);
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const normalized = normalizePath(path);
    if (!isRoot(normalized)) {
      const record = await this.getRecord(normalized);
      if (!record) throw new StorageError(`No such directory: ${normalized}`, 'not_found');
      if (record.kind !== 'dir') {
        throw new StorageError(`Not a directory: ${normalized}`, 'not_directory');
      }
    }
    const children = await this.listChildren(normalized);
    return children.map((record) => ({
      name: baseName(record.path),
      isDirectory: record.kind === 'dir',
      isFile: record.kind === 'file',
      isSymlink: false
    }));
  }

  async readFile(path: string): Promise<Uint8Array> {
    const record = await this.getFileRecord(path);
    if (typeof record.data === 'string') return new TextEncoder().encode(record.data);
    return new Uint8Array(record.data);
  }

  async readTextFile(path: string): Promise<string> {
    const record = await this.getFileRecord(path);
    if (typeof record.data === 'string') return record.data;
    return new TextDecoder().decode(record.data);
  }

  private async getFileRecord(path: string): Promise<EntryRecord> {
    const normalized = normalizePath(path);
    const record = await this.getRecord(normalized);
    if (!record) throw new StorageError(`No such file: ${normalized}`, 'not_found');
    if (record.kind !== 'file') {
      throw new StorageError(`Is a directory: ${normalized}`, 'is_directory');
    }
    return record;
  }

  async writeTextFile(path: string, contents: string, options?: BackendOptions): Promise<void> {
    return this.writeRecord(path, contents, new TextEncoder().encode(contents).byteLength, options);
  }

  async writeFile(path: string, contents: Uint8Array, options?: BackendOptions): Promise<void> {
    const copy = new Uint8Array(contents);
    return this.writeRecord(path, copy, copy.byteLength, options);
  }

  private async writeRecord(
    path: string,
    data: string | Uint8Array,
    size: number,
    options?: BackendOptions
  ): Promise<void> {
    const normalized = normalizePath(path);
    const origin: ChangeOrigin = options?.origin ?? 'local';
    await this.mutex.runExclusive(normalized, async () => {
      const parent = parentPath(normalized);
      if (!isRoot(parent)) {
        const parentRecord = await this.getRecord(parent);
        if (!parentRecord || parentRecord.kind !== 'dir') {
          throw new StorageError(`No such directory: ${parent}`, 'not_found');
        }
      }
      const existing = await this.getRecord(normalized);
      if (existing?.kind === 'dir') {
        throw new StorageError(`Is a directory: ${normalized}`, 'is_directory');
      }
      const now = Date.now();
      const store = await this.store('readwrite');
      await requestToPromise(
        store.put({
          path: normalized,
          parent,
          kind: 'file',
          data,
          size,
          mtime: now,
          ctime: existing?.ctime ?? now
        } satisfies EntryRecord)
      );
    });
    this.emitChange({ path: normalized, kind: 'write', origin });
  }

  async mkdir(path: string, options?: BackendOptions): Promise<void> {
    const normalized = normalizePath(path);
    if (isRoot(normalized)) return;
    const origin: ChangeOrigin = options?.origin ?? 'local';
    const now = Date.now();

    const makeDir = async (dirPath: string) => {
      const existing = await this.getRecord(dirPath);
      if (existing) {
        if (existing.kind !== 'dir') {
          throw new StorageError(`File exists: ${dirPath}`, 'already_exists');
        }
        return;
      }
      const store = await this.store('readwrite');
      await requestToPromise(
        store.put({
          path: dirPath,
          parent: parentPath(dirPath),
          kind: 'dir',
          data: '',
          size: 0,
          mtime: now,
          ctime: now
        } satisfies EntryRecord)
      );
    };

    if (options?.recursive) {
      // Build each ancestor, ignoring ones that already exist.
      let current = '';
      for (const segment of pathSegments(normalized)) {
        current += '/' + segment;
        await makeDir(current);
      }
    } else {
      const parent = parentPath(normalized);
      if (!isRoot(parent)) {
        const parentRecord = await this.getRecord(parent);
        if (!parentRecord || parentRecord.kind !== 'dir') {
          throw new StorageError(`No such directory: ${parent}`, 'not_found');
        }
      }
      await makeDir(normalized);
    }
    this.emitChange({ path: normalized, kind: 'create', origin });
  }

  async rename(from: string, to: string, options?: BackendOptions): Promise<void> {
    const src = normalizePath(from);
    const dst = normalizePath(to);
    const origin: ChangeOrigin = options?.origin ?? 'local';
    if (isRoot(src)) throw new StorageError('Cannot rename root', 'invalid_path');
    if (src === dst) return;
    if (isUnder(dst, src)) {
      throw new StorageError('Cannot move a directory into itself', 'invalid_path');
    }

    await this.mutex.runExclusive([src, dst], async () => {
      const db = await this.open();
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const srcRecord = await requestToPromise(
        store.get(src) as IDBRequest<EntryRecord | undefined>
      );
      if (!srcRecord) throw new StorageError(`No such file: ${src}`, 'not_found');
      const dstRecord = await requestToPromise(
        store.get(dst) as IDBRequest<EntryRecord | undefined>
      );
      if (dstRecord) throw new StorageError(`Destination exists: ${dst}`, 'already_exists');
      const dstParent = parentPath(dst);
      if (!isRoot(dstParent)) {
        const parentRecord = await requestToPromise(
          store.get(dstParent) as IDBRequest<EntryRecord | undefined>
        );
        if (!parentRecord || parentRecord.kind !== 'dir') {
          throw new StorageError(`No such directory: ${dstParent}`, 'not_found');
        }
      }

      // Rewrite the record and every descendant under the new prefix.
      const all = await requestToPromise(store.getAll() as IDBRequest<EntryRecord[]>);
      const affected = all.filter((r) => r.path === src || isUnder(r.path, src));
      const now = Date.now();
      for (const record of affected) {
        const suffix = record.path.slice(src.length);
        const moved: EntryRecord = {
          ...record,
          path: dst + suffix,
          parent: parentPath(dst + suffix),
          mtime: now
        };
        store.delete(record.path);
        store.put(moved);
      }
      await txDone(tx);
    });
    this.emitChange({ path: dst, kind: 'rename', origin, oldPath: src });
  }

  async remove(path: string, options?: BackendOptions): Promise<void> {
    const normalized = normalizePath(path);
    const origin: ChangeOrigin = options?.origin ?? 'local';
    if (isRoot(normalized)) throw new StorageError('Cannot remove root', 'invalid_path');

    await this.mutex.runExclusive(normalized, async () => {
      const db = await this.open();
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const record = await requestToPromise(
        store.get(normalized) as IDBRequest<EntryRecord | undefined>
      );
      if (!record) throw new StorageError(`No such file: ${normalized}`, 'not_found');

      if (record.kind === 'dir') {
        const all = await requestToPromise(store.getAll() as IDBRequest<EntryRecord[]>);
        const descendants = all.filter((r) => r.path !== normalized && isUnder(r.path, normalized));
        if (descendants.length > 0 && !options?.recursive) {
          throw new StorageError(`Directory is not empty: ${normalized}`, 'not_empty');
        }
        for (const child of descendants) store.delete(child.path);
      }
      store.delete(normalized);
      await txDone(tx);
    });
    this.emitChange({ path: normalized, kind: 'delete', origin });
  }

  async stat(path: string): Promise<FileStat> {
    const normalized = normalizePath(path);
    if (isRoot(normalized)) return { size: 0, mtime: null, birthtime: null };
    const record = await this.getRecord(normalized);
    if (!record) throw new StorageError(`No such file: ${normalized}`, 'not_found');
    return {
      size: record.size,
      mtime: new Date(record.mtime),
      birthtime: new Date(record.ctime)
    };
  }

  async exists(path: string): Promise<boolean> {
    const normalized = normalizePath(path);
    if (isRoot(normalized)) return true;
    return (await this.getRecord(normalized)) !== undefined;
  }
}
