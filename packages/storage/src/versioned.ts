import { encodePathAsDir, hasHiddenSegment, normalizePath, pathSegments } from './paths';
import type { BackendOptions, FileVersion, StorageBackend, VersionedStorageBackend } from './types';

export interface VersioningOptions {
  // Directory name inside each collection root holding version history.
  // Defaults to '.tactile/versions'.
  versionsDir?: string;
  // Max versions kept per file. Older versions are pruned on write.
  maxVersionsPerFile?: number;
  // Files larger than this many bytes are not versioned.
  maxFileBytes?: number;
  // Minimum milliseconds between snapshots of the same file. Autosave
  // writes every keystroke debounce; without a floor the version cap would
  // churn through history in seconds. Set to 0 to snapshot every write.
  minIntervalMs?: number;
  // Which paths get versioned. Default: files under a collection root
  // (/Name/...) excluding hidden segments like .tactile.
  shouldVersion?: (path: string) => boolean;
}

const DEFAULT_VERSIONS_DIR = '.tactile/versions';
const DEFAULT_MAX_VERSIONS = 30;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_MIN_INTERVAL_MS = 30_000;

// Wraps a StorageBackend and snapshots the previous contents of a file
// before every overwrite. History lives inside the collection itself at
// <root>/.tactile/versions/<encoded-path>/<timestamp>.md so it is stored
// next to the data it describes and can travel with sync later.
//
// Semantics:
// - A write to a new file creates no version (nothing to preserve).
// - remove() deletes the file's history too: the versioned store mirrors the
//   user's intent to delete.
// - rename() leaves history keyed to the old path; listVersions on the new
//   path starts empty. Recovering an old version by path still works.
// - Versions are full snapshots, not diffs. At note sizes this is cheap and
//   gives the future sync/merge layer stable base revisions for 3-way merge.
export class VersionedBackend implements VersionedStorageBackend {
  readonly name: string;

  private versionsDir: string;
  private maxVersions: number;
  private maxFileBytes: number;
  private minInterval: number;
  private lastSnapshotAt = new Map<string, number>();
  private shouldVersion: (path: string) => boolean;

  constructor(
    private inner: StorageBackend,
    options: VersioningOptions = {}
  ) {
    this.name = `${inner.name}+versioned`;
    this.versionsDir = options.versionsDir ?? DEFAULT_VERSIONS_DIR;
    this.maxVersions = options.maxVersionsPerFile ?? DEFAULT_MAX_VERSIONS;
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    this.minInterval = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    this.shouldVersion =
      options.shouldVersion ??
      ((path: string) => {
        const segments = pathSegments(path);
        // Only files inside a collection root (/Collection/...), never
        // inside hidden dirs such as .tactile itself.
        return segments.length >= 2 && !hasHiddenSegment(path);
      });
  }

  // e.g. /Notes/a/b.md -> /Notes/.tactile/versions/%2FNotes%2Fa%2Fb.md-<hash>
  private versionDirFor(path: string): string {
    const normalized = normalizePath(path);
    const root = '/' + pathSegments(normalized)[0];
    return `${root}/${this.versionsDir}/${encodePathAsDir(normalized)}`;
  }

  private async snapshotBeforeWrite(path: string): Promise<void> {
    if (!(await this.inner.exists(path))) return;
    const stat = await this.inner.stat(path);
    if (stat.size > this.maxFileBytes) return;

    const now = Date.now();
    const last = this.lastSnapshotAt.get(path) ?? 0;
    if (this.minInterval > 0 && now - last < this.minInterval) return;
    this.lastSnapshotAt.set(path, now);

    const previous = await this.inner.readFile(path);
    const dir = this.versionDirFor(path);
    await this.inner.mkdir(dir, { recursive: true });

    // Guard against two snapshots landing in the same millisecond: bump the
    // timestamp until the name is free. This keeps names monotonic so
    // listVersions ordering is stable even under back-to-back writes.
    let versionTime = now;
    while (await this.inner.exists(`${dir}/${versionTime}.md`)) {
      versionTime++;
    }
    await this.inner.writeFile(`${dir}/${versionTime}.md`, previous, {
      // Snapshotting must not itself trigger versioning or a second
      // event burst beyond the write that caused it.
      keepVersion: false,
      origin: 'local'
    });

    // Prune oldest beyond the cap. Filenames sort chronologically.
    const versions = (await this.inner.readDir(dir))
      .filter((e) => e.isFile && e.name.endsWith('.md'))
      .map((e) => e.name)
      .sort();
    for (const stale of versions.slice(0, Math.max(0, versions.length - this.maxVersions))) {
      await this.inner.remove(`${dir}/${stale}`, { keepVersion: false, origin: 'local' });
    }
  }

  async listVersions(path: string): Promise<FileVersion[]> {
    const dir = this.versionDirFor(path);
    if (!(await this.inner.exists(dir))) return [];
    const names = (await this.inner.readDir(dir))
      .filter((e) => e.isFile && e.name.endsWith('.md'))
      .map((e) => e.name);
    return Promise.all(
      names.map(async (name) => {
        // Version files are <epoch>.md, with the epoch bumped past any
        // collision so names sort chronologically.
        const timestamp = Number(name.replace(/\.md$/, '')) || 0;
        const size = await this.inner
          .stat(`${dir}/${name}`)
          .then((s) => s.size)
          .catch(() => 0);
        return { id: name, timestamp, size };
      })
    ).then((versions) => versions.sort((a, b) => b.timestamp - a.timestamp));
  }

  async readVersion(path: string, id: string): Promise<string> {
    // id is a filename we generated; never allow traversal.
    if (id.includes('/') || id.includes('..')) {
      throw new Error(`Invalid version id: ${id}`);
    }
    return this.inner.readTextFile(`${this.versionDirFor(path)}/${id}`);
  }

  async restoreVersion(path: string, id: string): Promise<void> {
    const contents = await this.readVersion(path, id);
    // Goes through writeTextFile so the current state is snapshotted
    // first: restoring never loses data.
    await this.writeTextFile(path, contents);
  }

  // Delegate everything else, intercepting mutations.

  readDir(path: string, options?: BackendOptions) {
    return this.inner.readDir(path, options);
  }
  readTextFile(path: string, options?: BackendOptions) {
    return this.inner.readTextFile(path, options);
  }
  readFile(path: string, options?: BackendOptions) {
    return this.inner.readFile(path, options);
  }

  async writeTextFile(path: string, contents: string, options?: BackendOptions) {
    if (options?.keepVersion !== false && this.shouldVersion(path)) {
      await this.snapshotBeforeWrite(path);
    }
    return this.inner.writeTextFile(path, contents, options);
  }

  async writeFile(path: string, contents: Uint8Array, options?: BackendOptions) {
    if (options?.keepVersion !== false && this.shouldVersion(path)) {
      await this.snapshotBeforeWrite(path);
    }
    return this.inner.writeFile(path, contents, options);
  }

  mkdir(path: string, options?: BackendOptions) {
    return this.inner.mkdir(path, options);
  }

  async rename(from: string, to: string, options?: BackendOptions) {
    return this.inner.rename(from, to, options);
  }

  async remove(path: string, options?: BackendOptions) {
    const normalized = normalizePath(path);
    this.lastSnapshotAt.delete(normalized);
    const result = await this.inner.remove(path, options);
    // Drop history for permanently removed paths.
    if (this.shouldVersion(normalized)) {
      const dir = this.versionDirFor(normalized);
      if (await this.inner.exists(dir)) {
        await this.inner.remove(dir, { recursive: true, keepVersion: false, origin: 'local' });
      }
    }
    return result;
  }

  stat(path: string, options?: BackendOptions) {
    return this.inner.stat(path, options);
  }
  exists(path: string, options?: BackendOptions) {
    return this.inner.exists(path, options);
  }
  onDidChange(cb: Parameters<StorageBackend['onDidChange']>[0]) {
    return this.inner.onDidChange(cb);
  }

  // Expose the wrapped backend for callers that need raw access (migration).
  get raw(): StorageBackend {
    return this.inner;
  }
}
