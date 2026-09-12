import { describe, expect, it } from 'vitest';
import {
  ensureFormatVersion,
  FORMAT_META_PATH,
  readFormatMeta,
  STORAGE_FORMAT_VERSION,
  writeFormatMeta
} from './format';
import { MemoryBackend } from './test-utils';

describe('format constants', () => {
  it('pins the format version and meta path', () => {
    expect(STORAGE_FORMAT_VERSION).toBe(1);
    expect(FORMAT_META_PATH).toBe('/.tactile/format.json');
  });
});

describe('readFormatMeta', () => {
  it('returns null when the meta file does not exist', async () => {
    const backend = new MemoryBackend();
    expect(await readFormatMeta(backend)).toBeNull();
  });

  it('returns null when the meta file is not valid JSON', async () => {
    const backend = new MemoryBackend();
    await backend.mkdir('/.tactile', { recursive: true });
    await backend.writeTextFile(FORMAT_META_PATH, 'not json');
    expect(await readFormatMeta(backend)).toBeNull();
  });

  it('returns null when version is not a number', async () => {
    const backend = new MemoryBackend();
    await backend.mkdir('/.tactile', { recursive: true });
    await backend.writeTextFile(
      FORMAT_META_PATH,
      JSON.stringify({ version: 'one', backend: 'x', createdAt: 'y' })
    );
    expect(await readFormatMeta(backend)).toBeNull();
  });

  it('parses a previously written meta file', async () => {
    const backend = new MemoryBackend();
    const written = await writeFormatMeta(backend);
    expect(await readFormatMeta(backend)).toEqual(written);
  });
});

describe('writeFormatMeta', () => {
  it('writes the current version and backend name to the meta path', async () => {
    const backend = new MemoryBackend();
    const meta = await writeFormatMeta(backend);
    expect(meta.version).toBe(STORAGE_FORMAT_VERSION);
    expect(meta.backend).toBe('memory');
    expect(new Date(meta.createdAt).toString()).not.toBe('Invalid Date');

    const onDisk = JSON.parse(await backend.readTextFile(FORMAT_META_PATH));
    expect(onDisk).toEqual(meta);
  });
});

describe('ensureFormatVersion', () => {
  it('initializes a fresh store', async () => {
    const backend = new MemoryBackend();
    const meta = await ensureFormatVersion(backend);
    expect(meta.version).toBe(STORAGE_FORMAT_VERSION);
    expect(await backend.exists(FORMAT_META_PATH)).toBe(true);
  });

  it('returns existing meta without rewriting it', async () => {
    const backend = new MemoryBackend();
    await backend.mkdir('/.tactile', { recursive: true });
    const existing = {
      version: STORAGE_FORMAT_VERSION,
      backend: 'older-backend-name',
      createdAt: '2001-02-03T04:05:06.000Z'
    };
    await backend.writeTextFile(FORMAT_META_PATH, JSON.stringify(existing));
    expect(await ensureFormatVersion(backend)).toEqual(existing);
  });

  it('throws when the store was written by a newer version', async () => {
    const backend = new MemoryBackend();
    await backend.mkdir('/.tactile', { recursive: true });
    await backend.writeTextFile(
      FORMAT_META_PATH,
      JSON.stringify({ version: STORAGE_FORMAT_VERSION + 1, backend: 'x', createdAt: 'y' })
    );
    await expect(ensureFormatVersion(backend)).rejects.toThrow(/newer than this app supports/);
  });
});
