import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodePathAsDir } from './paths';
import { MemoryBackend } from './test-utils';
import { VersionedBackend, type VersioningOptions } from './versioned';

const T0 = 1_700_000_000_000;

function setup(options?: VersioningOptions) {
  const inner = new MemoryBackend();
  const backend = new VersionedBackend(inner, options);
  return { inner, backend };
}

function versionDir(path: string): string {
  // /Notes/a/b.md -> /Notes/.tactile/versions/<encoded>
  const root = '/' + path.split('/')[1];
  return `${root}/.tactile/versions/${encodePathAsDir(path)}`;
}

async function versionContents(inner: MemoryBackend, path: string): Promise<string[]> {
  const dir = versionDir(path);
  if (!(await inner.exists(dir))) return [];
  const entries = await inner.readDir(dir);
  const names = entries
    .filter((e) => e.isFile && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort();
  return Promise.all(names.map((n) => inner.readTextFile(`${dir}/${n}`)));
}

describe('VersionedBackend naming', () => {
  it('suffixes the inner backend name', () => {
    const { backend } = setup();
    expect(backend.name).toBe('memory+versioned');
    expect(backend.raw).toBeInstanceOf(MemoryBackend);
  });
});

describe('snapshotBeforeWrite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates no version for a brand new file', async () => {
    const { inner, backend } = setup({ minIntervalMs: 0 });
    await backend.writeTextFile('/Notes/a.md', 'first');
    expect(await inner.exists(versionDir('/Notes/a.md'))).toBe(false);
    expect(await backend.listVersions('/Notes/a.md')).toEqual([]);
  });

  it('snapshots the previous contents on overwrite', async () => {
    const { inner, backend } = setup({ minIntervalMs: 0 });
    await backend.writeTextFile('/Notes/a.md', 'first');
    await backend.writeTextFile('/Notes/a.md', 'second');
    expect(await versionContents(inner, '/Notes/a.md')).toEqual(['first']);
    expect(await backend.readTextFile('/Notes/a.md')).toBe('second');
  });

  it('skips the snapshot when keepVersion is false', async () => {
    const { inner, backend } = setup({ minIntervalMs: 0 });
    await backend.writeTextFile('/Notes/a.md', 'first');
    await backend.writeTextFile('/Notes/a.md', 'second', { keepVersion: false });
    expect(await inner.exists(versionDir('/Notes/a.md'))).toBe(false);
  });

  it('stores versions under <root>/.tactile/versions/<encoded-path>/<ms>.md', async () => {
    const { inner, backend } = setup({ minIntervalMs: 0 });
    await backend.writeTextFile('/Notes/a/b.md', 'v1');
    vi.setSystemTime(T0 + 1000);
    await backend.writeTextFile('/Notes/a/b.md', 'v2');
    const dir = versionDir('/Notes/a/b.md');
    expect(dir).toBe(`/Notes/.tactile/versions/${encodePathAsDir('/Notes/a/b.md')}`);
    expect(await inner.readTextFile(`${dir}/${T0 + 1000}.md`)).toBe('v1');
  });

  it('bumps the timestamp when two snapshots land in the same millisecond', async () => {
    const { inner, backend } = setup({ minIntervalMs: 0 });
    await backend.writeTextFile('/Notes/a.md', 'v1');
    await backend.writeTextFile('/Notes/a.md', 'v2');
    await backend.writeTextFile('/Notes/a.md', 'v3');
    const dir = versionDir('/Notes/a.md');
    const names = (await inner.readDir(dir)).map((e) => e.name).sort();
    expect(names).toEqual([`${T0}.md`, `${T0 + 1}.md`]);
    const versions = await backend.listVersions('/Notes/a.md');
    expect(versions.map((v) => v.timestamp)).toEqual([T0 + 1, T0]);
  });
});

describe('minIntervalMs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('suppresses snapshots that arrive faster than the interval', async () => {
    const { backend } = setup({ minIntervalMs: 30_000 });
    await backend.writeTextFile('/Notes/a.md', 'v1');
    vi.setSystemTime(T0 + 100);
    await backend.writeTextFile('/Notes/a.md', 'v2'); // snapshot of v1
    vi.setSystemTime(T0 + 200);
    await backend.writeTextFile('/Notes/a.md', 'v3'); // too soon, skipped
    expect(await backend.listVersions('/Notes/a.md')).toHaveLength(1);
    expect((await backend.listVersions('/Notes/a.md'))[0].timestamp).toBe(T0 + 100);
  });

  it('allows another snapshot once the interval has elapsed', async () => {
    const { inner, backend } = setup({ minIntervalMs: 30_000 });
    await backend.writeTextFile('/Notes/a.md', 'v1');
    vi.setSystemTime(T0 + 100);
    await backend.writeTextFile('/Notes/a.md', 'v2');
    vi.setSystemTime(T0 + 30_101);
    await backend.writeTextFile('/Notes/a.md', 'v3');
    expect(await versionContents(inner, '/Notes/a.md')).toEqual(['v1', 'v2']);
  });

  it('snapshots every write when set to 0', async () => {
    const { backend } = setup({ minIntervalMs: 0 });
    await backend.writeTextFile('/Notes/a.md', 'v1');
    await backend.writeTextFile('/Notes/a.md', 'v2');
    await backend.writeTextFile('/Notes/a.md', 'v3');
    expect(await backend.listVersions('/Notes/a.md')).toHaveLength(2);
  });
});

describe('maxVersionsPerFile pruning', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps only the newest versions once over the cap', async () => {
    const { inner, backend } = setup({ minIntervalMs: 0, maxVersionsPerFile: 2 });
    await backend.writeTextFile('/Notes/a.md', 'v1');
    for (let i = 2; i <= 5; i++) {
      vi.setSystemTime(T0 + i * 1000);
      await backend.writeTextFile('/Notes/a.md', `v${i}`);
    }
    // Snapshots hold v1..v4 taken at T0+2000..T0+5000; the cap keeps the two
    // newest.
    const dir = versionDir('/Notes/a.md');
    const names = (await inner.readDir(dir)).map((e) => e.name).sort();
    expect(names).toEqual([`${T0 + 4000}.md`, `${T0 + 5000}.md`]);
    expect(await versionContents(inner, '/Notes/a.md')).toEqual(['v3', 'v4']);
  });

  it('never exceeds the cap under sustained writes', async () => {
    const { backend } = setup({ minIntervalMs: 0, maxVersionsPerFile: 3 });
    await backend.writeTextFile('/Notes/a.md', 'v0');
    for (let i = 1; i <= 10; i++) {
      vi.setSystemTime(T0 + i);
      await backend.writeTextFile('/Notes/a.md', `v${i}`);
    }
    expect(await backend.listVersions('/Notes/a.md')).toHaveLength(3);
  });
});

describe('maxFileBytes', () => {
  it('does not version files larger than the limit', async () => {
    const { inner, backend } = setup({ minIntervalMs: 0, maxFileBytes: 4 });
    await backend.writeTextFile('/Notes/big.md', '12345');
    await backend.writeTextFile('/Notes/big.md', 'x');
    expect(await inner.exists(versionDir('/Notes/big.md'))).toBe(false);
  });

  it('versions files at or under the limit', async () => {
    const { inner, backend } = setup({ minIntervalMs: 0, maxFileBytes: 5 });
    await backend.writeTextFile('/Notes/ok.md', '12345');
    await backend.writeTextFile('/Notes/ok.md', 'x');
    expect(await versionContents(inner, '/Notes/ok.md')).toEqual(['12345']);
  });
});

describe('shouldVersion defaults', () => {
  it('does not version files outside a collection root', async () => {
    const { inner, backend } = setup({ minIntervalMs: 0 });
    await backend.writeTextFile('/loose.md', 'v1');
    await backend.writeTextFile('/loose.md', 'v2');
    expect(await backend.listVersions('/loose.md')).toEqual([]);
    expect(await inner.exists('/.tactile')).toBe(false);
  });

  it('does not version paths with hidden segments like .tactile', async () => {
    const { inner, backend } = setup({ minIntervalMs: 0 });
    await backend.writeTextFile('/Notes/.tactile/conf.md', 'v1');
    await backend.writeTextFile('/Notes/.tactile/conf.md', 'v2');
    expect(await backend.listVersions('/Notes/.tactile/conf.md')).toEqual([]);
    // And no nested versions dir was created under .tactile.
    expect(await inner.exists('/Notes/.tactile/versions')).toBe(false);
  });

  it('honours a custom shouldVersion predicate', async () => {
    const { backend } = setup({ minIntervalMs: 0, shouldVersion: () => false });
    await backend.writeTextFile('/Notes/a.md', 'v1');
    await backend.writeTextFile('/Notes/a.md', 'v2');
    expect(await backend.listVersions('/Notes/a.md')).toEqual([]);
  });

  it('honours a custom rootFor resolver', async () => {
    const { inner, backend } = setup({
      minIntervalMs: 0,
      rootFor: () => '/vault'
    });
    await backend.writeTextFile('/deep/inside/a.md', 'v1');
    await backend.writeTextFile('/deep/inside/a.md', 'v2');
    const dir = `/vault/.tactile/versions/${encodePathAsDir('/deep/inside/a.md')}`;
    expect(await inner.exists(dir)).toBe(true);
  });
});

describe('listVersions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns versions newest first with id, timestamp and size', async () => {
    const { backend } = setup({ minIntervalMs: 0 });
    await backend.writeTextFile('/Notes/a.md', 'aa');
    vi.setSystemTime(T0 + 1000);
    await backend.writeTextFile('/Notes/a.md', 'bbb');
    vi.setSystemTime(T0 + 2000);
    await backend.writeTextFile('/Notes/a.md', 'c');
    const versions = await backend.listVersions('/Notes/a.md');
    expect(versions.map((v) => v.id)).toEqual([`${T0 + 2000}.md`, `${T0 + 1000}.md`]);
    expect(versions[0]).toEqual({ id: `${T0 + 2000}.md`, timestamp: T0 + 2000, size: 3 });
    expect(versions[1]).toEqual({ id: `${T0 + 1000}.md`, timestamp: T0 + 1000, size: 2 });
  });

  it('returns an empty list for unversioned or missing paths', async () => {
    const { backend } = setup();
    expect(await backend.listVersions('/Notes/never.md')).toEqual([]);
  });
});

describe('readVersion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads a stored snapshot by id', async () => {
    const { backend } = setup({ minIntervalMs: 0 });
    await backend.writeTextFile('/Notes/a.md', 'old');
    await backend.writeTextFile('/Notes/a.md', 'new');
    expect(await backend.readVersion('/Notes/a.md', `${T0}.md`)).toBe('old');
  });

  it('rejects ids that could traverse out of the version dir', async () => {
    const { backend } = setup({ minIntervalMs: 0 });
    await backend.writeTextFile('/Notes/a.md', 'old');
    await backend.writeTextFile('/Notes/a.md', 'new');
    await expect(backend.readVersion('/Notes/a.md', '../a.md')).rejects.toThrow(
      /Invalid version id/
    );
    await expect(backend.readVersion('/Notes/a.md', 'a/b.md')).rejects.toThrow(
      /Invalid version id/
    );
  });

  it('throws for paths that have no version dir', async () => {
    const { backend } = setup();
    await expect(backend.readVersion('/loose.md', 'x.md')).rejects.toThrow(/not versioned/);
  });
});

describe('restoreVersion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the snapshot back and preserves the current state as a version', async () => {
    const { backend } = setup({ minIntervalMs: 0 });
    await backend.writeTextFile('/Notes/a.md', 'v1');
    vi.setSystemTime(T0 + 1000);
    await backend.writeTextFile('/Notes/a.md', 'v2');
    vi.setSystemTime(T0 + 2000);
    await backend.restoreVersion('/Notes/a.md', `${T0 + 1000}.md`);
    expect(await backend.readTextFile('/Notes/a.md')).toBe('v1');
    // Restoring went through a normal write, so 'v2' was snapshotted first.
    expect(await backend.readVersion('/Notes/a.md', `${T0 + 2000}.md`)).toBe('v2');
  });
});

describe('remove', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deletes the file history along with the file', async () => {
    const { inner, backend } = setup({ minIntervalMs: 0 });
    await backend.writeTextFile('/Notes/a.md', 'v1');
    await backend.writeTextFile('/Notes/a.md', 'v2');
    await backend.remove('/Notes/a.md');
    expect(await inner.exists(versionDir('/Notes/a.md'))).toBe(false);
    expect(await backend.listVersions('/Notes/a.md')).toEqual([]);
  });
});

describe('rename', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('leaves history keyed to the old path', async () => {
    const { backend } = setup({ minIntervalMs: 0 });
    await backend.writeTextFile('/Notes/old.md', 'v1');
    await backend.writeTextFile('/Notes/old.md', 'v2');
    await backend.rename('/Notes/old.md', '/Notes/new.md');
    // Documented behavior: the new path starts with empty history while the
    // old path can still read its stored versions.
    expect(await backend.listVersions('/Notes/new.md')).toEqual([]);
    expect(await backend.readVersion('/Notes/old.md', `${T0}.md`)).toBe('v1');
  });
});

describe('passthrough methods', () => {
  it('delegates reads, stat, exists and mkdir to the inner backend', async () => {
    const { inner, backend } = setup();
    await backend.mkdir('/Notes', { recursive: true });
    await backend.writeTextFile('/Notes/a.md', 'hi');
    expect(await backend.exists('/Notes/a.md')).toBe(true);
    expect((await backend.stat('/Notes/a.md')).size).toBe(2);
    expect((await backend.readDir('/Notes')).map((e) => e.name)).toEqual(['a.md']);
    expect(await inner.readTextFile('/Notes/a.md')).toBe('hi');
  });

  it('forwards change events from the inner backend', async () => {
    const { backend } = setup();
    const events: string[] = [];
    const off = backend.onDidChange((e) => events.push(`${e.kind}:${e.path}`));
    await backend.writeTextFile('/Notes/a.md', 'hi');
    off();
    await backend.writeTextFile('/Notes/a.md', 'hi2');
    // The listener saw the first write, and unsubscribing stopped delivery
    // before the second write.
    expect(events).toEqual(['create:/Notes/a.md']);
  });
});
