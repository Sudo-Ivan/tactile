import { EventedBackend } from './events';
import { normalizePath } from './paths';
import type { BackendOptions, ChangeOrigin, DirEntry, FileStat, StorageBackend } from './types';

// Minimal structural types matching @tauri-apps/plugin-fs. The functions are
// injected so this package has no dependency on the Tauri runtime, which also
// lets the desktop app keep its own plugin version.

export interface TauriFsFunctions {
  readDir(path: string, options?: { baseDir?: number }): Promise<DirEntry[]>;
  readFile(path: string, options?: { baseDir?: number }): Promise<Uint8Array>;
  readTextFile(path: string, options?: { baseDir?: number }): Promise<string>;
  writeFile(path: string, data: Uint8Array, options?: { baseDir?: number }): Promise<void>;
  writeTextFile(path: string, data: string, options?: { baseDir?: number }): Promise<void>;
  mkdir(path: string, options?: { baseDir?: number; recursive?: boolean }): Promise<void>;
  rename(
    oldPath: string,
    newPath: string,
    options?: { oldPathBaseDir?: number; newPathBaseDir?: number }
  ): Promise<void>;
  remove(path: string, options?: { baseDir?: number; recursive?: boolean }): Promise<void>;
  stat(
    path: string,
    options?: { baseDir?: number }
  ): Promise<{ size: number; mtime: Date | null; birthtime: Date | null }>;
  exists(path: string, options?: { baseDir?: number }): Promise<boolean>;
}

// Adapter over tauri-plugin-fs for the desktop app. Paths on desktop are real
// OS paths and may not be POSIX-absolute on Windows, so normalization is
// skipped here (the desktop code already hands out real paths). Mutations emit
// change events so the same reactive wiring works on both platforms; external
// writes still arrive through the plugin-fs watcher the desktop app already
// uses.
export function createTauriBackend(fns: TauriFsFunctions): StorageBackend {
  class TauriBackend extends EventedBackend implements StorageBackend {
    readonly name = 'tauri';

    private opts(options?: BackendOptions): { baseDir?: number; recursive?: boolean } {
      const out: { baseDir?: number; recursive?: boolean } = {};
      if (options?.baseDir !== undefined) out.baseDir = options.baseDir;
      if (options?.recursive !== undefined) out.recursive = options.recursive;
      return out;
    }

    private origin(options?: BackendOptions): ChangeOrigin {
      return options?.origin ?? 'local';
    }

    readDir(path: string, options?: BackendOptions) {
      return fns.readDir(path, this.opts(options));
    }
    readFile(path: string, options?: BackendOptions) {
      return fns.readFile(path, this.opts(options));
    }
    readTextFile(path: string, options?: BackendOptions) {
      return fns.readTextFile(path, this.opts(options));
    }
    async writeTextFile(path: string, contents: string, options?: BackendOptions) {
      await fns.writeTextFile(path, contents, this.opts(options));
      this.emitChange({ path, kind: 'write', origin: this.origin(options) });
    }
    async writeFile(path: string, contents: Uint8Array, options?: BackendOptions) {
      await fns.writeFile(path, contents, this.opts(options));
      this.emitChange({ path, kind: 'write', origin: this.origin(options) });
    }
    async mkdir(path: string, options?: BackendOptions) {
      await fns.mkdir(path, this.opts(options));
      this.emitChange({ path, kind: 'create', origin: this.origin(options) });
    }
    async rename(from: string, to: string, options?: BackendOptions) {
      // plugin-fs takes per-path base dirs for rename.
      const opts =
        options?.baseDir !== undefined
          ? { oldPathBaseDir: options.baseDir, newPathBaseDir: options.baseDir }
          : undefined;
      await fns.rename(from, to, opts);
      this.emitChange({ path: to, kind: 'rename', origin: this.origin(options), oldPath: from });
    }
    async remove(path: string, options?: BackendOptions) {
      await fns.remove(path, this.opts(options));
      this.emitChange({ path, kind: 'delete', origin: this.origin(options) });
    }
    stat(path: string, options?: BackendOptions): Promise<FileStat> {
      return fns.stat(path, this.opts(options));
    }
    exists(path: string, options?: BackendOptions) {
      return fns.exists(path, this.opts(options));
    }
  }

  return new TauriBackend();
}

// normalizePath is re-exported here so consumers of the tauri adapter that
// deal in virtual paths (sync layer) have it at hand.
export { normalizePath };
