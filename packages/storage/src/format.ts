import type { StorageBackend } from './types';

// On-disk format versioning. The backend writes /.tactile/format.json at
// init. If a future release changes the layout (index files, version dir
// naming, ...), bump STORAGE_FORMAT_VERSION and add a migration step keyed
// on the stored version. A store written by a newer app than the one reading
// it fails loudly instead of silently corrupting.
export const STORAGE_FORMAT_VERSION = 1;
export const FORMAT_META_PATH = '/.tactile/format.json';

export interface FormatMeta {
  version: number;
  backend: string;
  createdAt: string;
}

export async function readFormatMeta(backend: StorageBackend): Promise<FormatMeta | null> {
  try {
    const text = await backend.readTextFile(FORMAT_META_PATH);
    const meta = JSON.parse(text) as FormatMeta;
    if (typeof meta.version !== 'number') return null;
    return meta;
  } catch {
    return null;
  }
}

export async function writeFormatMeta(backend: StorageBackend): Promise<FormatMeta> {
  const meta: FormatMeta = {
    version: STORAGE_FORMAT_VERSION,
    backend: backend.name,
    createdAt: new Date().toISOString()
  };
  await backend.mkdir('/.tactile', { recursive: true });
  await backend.writeTextFile(FORMAT_META_PATH, JSON.stringify(meta, null, 2), {
    keepVersion: false
  });
  return meta;
}

// Ensures the store is at the current format version. Returns the meta.
// Throws if the store was written by a newer version than this build knows.
export async function ensureFormatVersion(backend: StorageBackend): Promise<FormatMeta> {
  const meta = await readFormatMeta(backend);
  if (!meta) return writeFormatMeta(backend);
  if (meta.version > STORAGE_FORMAT_VERSION) {
    throw new Error(
      `Storage format v${meta.version} is newer than this app supports (v${STORAGE_FORMAT_VERSION}). Please update Tactile.`
    );
  }
  // No migrations exist yet; when version is bumped, apply steps here.
  return meta;
}
