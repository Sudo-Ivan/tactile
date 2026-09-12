import { EventedBackend } from './events';
import { KeyedMutex, withWebLock } from './mutex';
import { StorageError, normalizePath, parentPath, pathSegments } from './paths';
import type { BackendOptions, ChangeOrigin, DirEntry, FileStat, StorageBackend } from './types';

type DirHandle = FileSystemDirectoryHandle;
type FileHandle = FileSystemFileHandle;

interface WritableStream {
  write(data: string | Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

interface MovableHandle extends FileSystemHandle {
  move?(destination: FileSystemDirectoryHandle, name?: string): Promise<void>;
  move?(name: string): Promise<void>;
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

function toStorageError(error: unknown, path: string): never {
  if (isNotFound(error)) {
    throw new StorageError(`No such file or directory: ${path}`, 'not_found');
  }
  if (error instanceof DOMException && error.name === 'TypeMismatchError') {
    throw new StorageError(`Path type mismatch: ${path}`, 'is_directory');
  }
  if (error instanceof DOMException && error.name === 'NoModificationAllowedError') {
    throw new StorageError(`File is locked by another tab: ${path}`, 'locked');
  }
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    throw new StorageError(`Storage quota exceeded while writing: ${path}`, 'quota');
  }
  if (error instanceof StorageError) throw error;
  throw error instanceof Error ? error : new StorageError(String(error));
}

// StorageBackend on the Origin Private File System. Available in every
// modern browser including mobile Safari, which is why it replaces PGlite.
//
// - Writes go through FileSystemWritableFileStream, which commits to a swap
//   file on close(): a crashed write never leaves a truncated file.
// - Mutations are serialized per path within the tab (KeyedMutex) and across
//   tabs via Web Locks, because two createWritable() calls on the same OPFS
//   file in different tabs reject with NoModificationAllowedError.
// - OPFS has no watcher API; change events only cover writes made through
//   this backend in this tab. Other tabs are not observed (same limitation
//   the previous IndexedDB storage had).
export class OpfsBackend extends EventedBackend implements StorageBackend {
  readonly name = 'opfs';

  private rootPromise: Promise<DirHandle> | null = null;
  private mutex = new KeyedMutex();

  // rootName namespaces the app inside the origin-private root.
  constructor(private rootName = 'tactile') {
    super();
  }

  private init(): Promise<DirHandle> {
    if (!this.rootPromise) {
      this.rootPromise = (async () => {
        if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
          throw new StorageError('OPFS is not available in this browser', 'unsupported');
        }
        // Ask for durable storage so notes are not evicted under pressure.
        // Best effort: returns false on some platforms, data still works.
        navigator.storage.persist?.().catch(() => undefined);
        const opfsRoot = await navigator.storage.getDirectory();
        return opfsRoot.getDirectoryHandle(this.rootName, { create: true });
      })();
      // Do not cache a rejected init: allow retry on next call.
      this.rootPromise.catch(() => {
        this.rootPromise = null;
      });
    }
    return this.rootPromise;
  }

  // Resolve all but the last segment to a directory handle.
  private async resolveParent(path: string): Promise<{ dir: DirHandle; name: string }> {
    const normalized = normalizePath(path);
    const segments = pathSegments(normalized);
    if (segments.length === 0) {
      throw new StorageError('Operation not allowed on root', 'invalid_path');
    }
    const root = await this.init();
    let dir = root;
    for (const segment of segments.slice(0, -1)) {
      try {
        dir = await dir.getDirectoryHandle(segment);
      } catch (error) {
        toStorageError(error, normalized);
      }
    }
    return { dir, name: segments[segments.length - 1] };
  }

  private async resolveDir(path: string): Promise<DirHandle> {
    const normalized = normalizePath(path);
    const root = await this.init();
    let dir = root;
    for (const segment of pathSegments(normalized)) {
      try {
        dir = await dir.getDirectoryHandle(segment);
      } catch (error) {
        toStorageError(error, normalized);
      }
    }
    return dir;
  }

  private async resolveFile(path: string): Promise<FileHandle> {
    const normalized = normalizePath(path);
    const { dir, name } = await this.resolveParent(normalized);
    try {
      return await dir.getFileHandle(name);
    } catch (error) {
      toStorageError(error, normalized);
    }
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const normalized = normalizePath(path);
    const dir = await this.resolveDir(normalized);
    const entries: DirEntry[] = [];
    // entries() is in the TS DOM lib on recent versions; iterate defensively.
    const iterable = (
      dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }
    ).entries();
    for await (const [name, handle] of iterable) {
      entries.push({
        name,
        isDirectory: handle.kind === 'directory',
        isFile: handle.kind === 'file',
        isSymlink: false
      });
    }
    return entries;
  }

  async readFile(path: string): Promise<Uint8Array> {
    const normalized = normalizePath(path);
    const handle = await this.resolveFile(normalized);
    try {
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      toStorageError(error, normalized);
    }
  }

  async readTextFile(path: string): Promise<string> {
    const normalized = normalizePath(path);
    const handle = await this.resolveFile(normalized);
    try {
      const file = await handle.getFile();
      return file.text();
    } catch (error) {
      toStorageError(error, normalized);
    }
  }

  async writeTextFile(path: string, contents: string, options?: BackendOptions): Promise<void> {
    return this.writeBytes(path, new TextEncoder().encode(contents), options);
  }

  async writeFile(path: string, contents: Uint8Array, options?: BackendOptions): Promise<void> {
    return this.writeBytes(path, contents, options);
  }

  private async writeBytes(
    path: string,
    contents: Uint8Array,
    options?: BackendOptions
  ): Promise<void> {
    const normalized = normalizePath(path);
    const origin: ChangeOrigin = options?.origin ?? 'local';
    await this.mutex.runExclusive(normalized, () =>
      withWebLock(`tactile:opfs:${normalized}`, async () => {
        const { dir, name } = await this.resolveParent(normalized);
        let handle: FileHandle;
        try {
          handle = await dir.getFileHandle(name, { create: true });
          const writable = (await handle.createWritable({
            keepExistingData: false
          })) as unknown as WritableStream;
          try {
            await writable.write(contents);
            await writable.close();
          } catch (error) {
            await writable.abort().catch(() => undefined);
            throw error;
          }
        } catch (error) {
          toStorageError(error, normalized);
        }
      })
    );
    this.emitChange({ path: normalized, kind: 'write', origin });
  }

  async mkdir(path: string, options?: BackendOptions): Promise<void> {
    const normalized = normalizePath(path);
    if (normalized === '/') return;
    const origin: ChangeOrigin = options?.origin ?? 'local';
    const root = await this.init();
    const segments = pathSegments(normalized);

    if (options?.recursive) {
      let dir = root;
      for (const segment of segments) {
        dir = await dir.getDirectoryHandle(segment, { create: true });
      }
    } else {
      const { dir, name } = await this.resolveParent(normalized);
      try {
        await dir.getDirectoryHandle(name, { create: true });
      } catch (error) {
        toStorageError(error, normalized);
      }
    }
    this.emitChange({ path: normalized, kind: 'create', origin });
  }

  async rename(from: string, to: string, options?: BackendOptions): Promise<void> {
    const src = normalizePath(from);
    const dst = normalizePath(to);
    const origin: ChangeOrigin = options?.origin ?? 'local';
    if (src === '/') throw new StorageError('Cannot rename root', 'invalid_path');
    if (dst === src) return;
    if (dst.startsWith(src + '/')) {
      throw new StorageError('Cannot move a directory into itself', 'invalid_path');
    }

    await this.mutex.runExclusive([src, dst], () =>
      withWebLock(`tactile:opfs:rename:${src}:${dst}`, async () => {
        const srcParent = parentPath(src);
        const dstParent = parentPath(dst);
        const { dir: srcDir, name: srcName } = await this.resolveParent(src);
        const { dir: dstDir, name: dstName } = await this.resolveParent(dst);

        const sameDir = srcParent === dstParent;
        const handle = (await (async () => {
          try {
            return srcDir.getDirectoryHandle(srcName);
          } catch {
            try {
              return await srcDir.getFileHandle(srcName);
            } catch (error) {
              toStorageError(error, src);
            }
          }
        })()) as MovableHandle;

        // Native move() is Chrome-only for OPFS handles. If it is missing
        // or rejects, fall back to copy + delete.
        if (typeof handle.move === 'function') {
          try {
            if (sameDir) {
              await handle.move(dstName);
            } else {
              await handle.move(dstDir, dstName);
            }
            this.emitChange({ path: dst, kind: 'rename', origin, oldPath: src });
            return;
          } catch {
            // fall through to copy + delete
          }
        }

        await this.copyHandle(src, dst);
        await this.removeInternal(src);
        this.emitChange({ path: dst, kind: 'rename', origin, oldPath: src });
      })
    );
  }

  private async copyHandle(from: string, to: string): Promise<void> {
    try {
      const dir = await this.resolveDir(from);
      // It is a directory: copy recursively.
      const segments = pathSegments(to);
      const root = await this.init();
      let dstDir = root;
      for (const segment of segments) {
        dstDir = await dstDir.getDirectoryHandle(segment, { create: true });
      }
      await this.copyDirRecursive(dir, dstDir);
    } catch (error) {
      if (isNotFound(error) || (error instanceof StorageError && error.code === 'not_found')) {
        // It is a file.
        const data = await this.readFile(from);
        const { dir, name } = await this.resolveParent(to);
        const handle = await dir.getFileHandle(name, { create: true });
        const writable = (await handle.createWritable()) as unknown as WritableStream;
        try {
          await writable.write(data);
          await writable.close();
        } catch (writeError) {
          await writable.abort().catch(() => undefined);
          throw writeError;
        }
        return;
      }
      throw error;
    }
  }

  private async copyDirRecursive(src: DirHandle, dst: DirHandle): Promise<void> {
    const iterable = (
      src as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }
    ).entries();
    for await (const [name, handle] of iterable) {
      if (handle.kind === 'directory') {
        const child = await dst.getDirectoryHandle(name, { create: true });
        await this.copyDirRecursive(handle as DirHandle, child);
      } else {
        const file = await (handle as FileHandle).getFile();
        const data = new Uint8Array(await file.arrayBuffer());
        const out = await dst.getFileHandle(name, { create: true });
        const writable = (await out.createWritable()) as unknown as WritableStream;
        try {
          await writable.write(data);
          await writable.close();
        } catch (error) {
          await writable.abort().catch(() => undefined);
          throw error;
        }
      }
    }
  }

  async remove(path: string, options?: BackendOptions): Promise<void> {
    const normalized = normalizePath(path);
    if (normalized === '/') throw new StorageError('Cannot remove root', 'invalid_path');
    const origin: ChangeOrigin = options?.origin ?? 'local';
    await this.mutex.runExclusive(normalized, () =>
      withWebLock(`tactile:opfs:${normalized}`, () =>
        this.removeInternal(normalized, options?.recursive ?? false)
      )
    );
    this.emitChange({ path: normalized, kind: 'delete', origin });
  }

  private async removeInternal(path: string, recursive = false): Promise<void> {
    const { dir, name } = await this.resolveParent(path);
    try {
      await dir.removeEntry(name, { recursive });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'InvalidModificationError') {
        throw new StorageError(`Directory is not empty: ${path}`, 'not_empty');
      }
      toStorageError(error, path);
    }
  }

  async stat(path: string): Promise<FileStat> {
    const normalized = normalizePath(path);
    if (normalized === '/') return { size: 0, mtime: null, birthtime: null };
    const { dir, name } = await this.resolveParent(normalized);
    try {
      const file = await dir.getFileHandle(name);
      const f = await file.getFile();
      // OPFS has no birthtime; callers fall back to mtime.
      return { size: f.size, mtime: new Date(f.lastModified), birthtime: null };
    } catch {
      try {
        await dir.getDirectoryHandle(name);
        return { size: 0, mtime: null, birthtime: null };
      } catch (error) {
        toStorageError(error, normalized);
      }
    }
  }

  async exists(path: string): Promise<boolean> {
    const normalized = normalizePath(path);
    if (normalized === '/') return true;
    try {
      await this.stat(normalized);
      return true;
    } catch (error) {
      if (error instanceof StorageError && error.code === 'not_found') return false;
      throw error;
    }
  }
}
