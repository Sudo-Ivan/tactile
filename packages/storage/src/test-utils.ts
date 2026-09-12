// Shared test helpers. Not exported from the package entry point; imported
// directly by colocated *.test.ts files.
import { ChangeEmitter } from './events';
import { normalizePath, parentPath, StorageError } from './paths';
import type {
  BackendOptions,
  ChangeEvent,
  DirEntry,
  FileStat,
  StorageBackend,
  Unsubscribe
} from './types';

// Minimal in-memory StorageBackend. Paths are normalized POSIX style,
// parent directories are created implicitly by writes, and every mutation
// emits a change event so wrappers such as BroadcastBackend can be tested.
export class MemoryBackend extends ChangeEmitter implements StorageBackend {
  readonly name = 'memory';

  private files = new Map<string, Uint8Array>();
  private mtimes = new Map<string, Date>();
  private dirs = new Set<string>(['/']);

  private ensureParents(path: string): void {
    let dir = parentPath(path);
    const missing: string[] = [];
    while (!this.dirs.has(dir)) {
      missing.push(dir);
      dir = parentPath(dir);
    }
    for (const d of missing) this.dirs.add(d);
  }

  private changed(path: string, kind: ChangeEvent['kind'], options?: BackendOptions): void {
    this.emit({ path, kind, origin: options?.origin ?? 'local' });
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const p = normalizePath(path);
    if (!this.dirs.has(p)) {
      throw new StorageError(`No such directory: ${p}`, 'not_found');
    }
    const prefix = p === '/' ? '/' : p + '/';
    const children = new Map<string, DirEntry>();
    const consider = (full: string, isFile: boolean): void => {
      if (full === p || !full.startsWith(prefix)) return;
      const rest = full.slice(prefix.length);
      const slash = rest.indexOf('/');
      const name = slash === -1 ? rest : rest.slice(0, slash);
      if (children.has(name)) return;
      children.set(name, {
        name,
        isDirectory: slash !== -1 || !isFile,
        isFile: slash === -1 && isFile,
        isSymlink: false
      });
    };
    for (const d of this.dirs) consider(d, false);
    for (const f of this.files.keys()) consider(f, true);
    return [...children.values()];
  }

  async readFile(path: string): Promise<Uint8Array> {
    const p = normalizePath(path);
    const data = this.files.get(p);
    if (!data) throw new StorageError(`No such file: ${p}`, 'not_found');
    return new Uint8Array(data);
  }

  async readTextFile(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readFile(path));
  }

  async writeFile(path: string, contents: Uint8Array, options?: BackendOptions): Promise<void> {
    const p = normalizePath(path);
    this.ensureParents(p);
    const created = !this.files.has(p);
    this.files.set(p, new Uint8Array(contents));
    this.mtimes.set(p, new Date());
    this.changed(p, created ? 'create' : 'write', options);
  }

  async writeTextFile(path: string, contents: string, options?: BackendOptions): Promise<void> {
    await this.writeFile(path, new TextEncoder().encode(contents), options);
  }

  async mkdir(path: string, options?: BackendOptions): Promise<void> {
    const p = normalizePath(path);
    if (this.dirs.has(p)) return;
    if (this.files.has(p)) {
      throw new StorageError(`Not a directory: ${p}`, 'not_directory');
    }
    if (options?.recursive) {
      this.ensureParents(p + '/x');
      this.dirs.add(p);
    } else {
      const parent = parentPath(p);
      if (!this.dirs.has(parent)) {
        throw new StorageError(`No such directory: ${parent}`, 'not_found');
      }
      this.dirs.add(p);
    }
    this.changed(p, 'create', options);
  }

  async rename(from: string, to: string, options?: BackendOptions): Promise<void> {
    const src = normalizePath(from);
    const dst = normalizePath(to);
    if (this.files.has(src)) {
      this.ensureParents(dst);
      this.files.set(dst, this.files.get(src)!);
      this.mtimes.set(dst, new Date());
      this.files.delete(src);
      this.mtimes.delete(src);
      this.emit({ path: dst, kind: 'rename', origin: options?.origin ?? 'local', oldPath: src });
      return;
    }
    if (this.dirs.has(src)) {
      const prefix = src + '/';
      const move = (p: string): string => dst + p.slice(src.length);
      const movedDirs = [...this.dirs].filter((d) => d === src || d.startsWith(prefix));
      const movedFiles = [...this.files.keys()].filter((f) => f.startsWith(prefix));
      for (const d of movedDirs) this.dirs.delete(d);
      for (const f of movedFiles) {
        this.files.set(move(f), this.files.get(f)!);
        this.files.delete(f);
      }
      for (const d of movedDirs) this.dirs.add(move(d));
      this.emit({ path: dst, kind: 'rename', origin: options?.origin ?? 'local', oldPath: src });
      return;
    }
    throw new StorageError(`No such file or directory: ${src}`, 'not_found');
  }

  async remove(path: string, options?: BackendOptions): Promise<void> {
    const p = normalizePath(path);
    if (this.files.has(p)) {
      this.files.delete(p);
      this.mtimes.delete(p);
      this.changed(p, 'delete', options);
      return;
    }
    if (this.dirs.has(p) && p !== '/') {
      const prefix = p + '/';
      const children =
        [...this.dirs].some((d) => d.startsWith(prefix)) ||
        [...this.files.keys()].some((f) => f.startsWith(prefix));
      if (children && !options?.recursive) {
        throw new StorageError(`Directory not empty: ${p}`, 'not_empty');
      }
      for (const d of [...this.dirs].filter((d) => d === p || d.startsWith(prefix))) {
        this.dirs.delete(d);
      }
      for (const f of [...this.files.keys()].filter((f) => f.startsWith(prefix))) {
        this.files.delete(f);
        this.mtimes.delete(f);
      }
      this.changed(p, 'delete', options);
      return;
    }
    throw new StorageError(`No such file or directory: ${p}`, 'not_found');
  }

  async stat(path: string): Promise<FileStat> {
    const p = normalizePath(path);
    const data = this.files.get(p);
    if (data) {
      return { size: data.byteLength, mtime: this.mtimes.get(p) ?? null, birthtime: null };
    }
    if (this.dirs.has(p)) {
      return { size: 0, mtime: null, birthtime: null };
    }
    throw new StorageError(`No such file or directory: ${p}`, 'not_found');
  }

  async exists(path: string): Promise<boolean> {
    const p = normalizePath(path);
    return this.files.has(p) || this.dirs.has(p);
  }

  onDidChange(cb: (event: ChangeEvent) => void): Unsubscribe {
    return super.onDidChange(cb);
  }
}
