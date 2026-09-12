// Path helpers shared by all backends. Paths are always absolute, POSIX
// style, and normalized: no duplicate slashes, no trailing slash, no '.' or
// '..' segments. Root is '/'.

export class StorageError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'invalid_path'
      | 'not_found'
      | 'already_exists'
      | 'not_empty'
      | 'is_directory'
      | 'not_directory'
      | 'unsupported'
      | 'locked'
      | 'quota' = 'unsupported'
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export function normalizePath(path: string): string {
  if (typeof path !== 'string' || path.length === 0) {
    throw new StorageError(`Invalid path: ${String(path)}`, 'invalid_path');
  }

  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      throw new StorageError(`Path traversal is not allowed: ${path}`, 'invalid_path');
    }
    segments.push(segment);
  }

  return '/' + segments.join('/');
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.join('/'));
}

export function parentPath(path: string): string {
  const normalized = normalizePath(path);
  const idx = normalized.lastIndexOf('/');
  return idx <= 0 ? '/' : normalized.slice(0, idx);
}

export function baseName(path: string): string {
  const normalized = normalizePath(path);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

export function isRoot(path: string): boolean {
  return normalizePath(path) === '/';
}

export function pathSegments(path: string): string[] {
  const normalized = normalizePath(path);
  if (normalized === '/') return [];
  return normalized.slice(1).split('/');
}

// Whether child is equal to or nested under ancestor.
export function isUnder(child: string, ancestor: string): boolean {
  const c = normalizePath(child);
  const a = normalizePath(ancestor);
  return a === '/' || c === a || c.startsWith(a + '/');
}

// Whether any path segment is a dotfile component (`.tactile`, `.trash`, ...).
export function hasHiddenSegment(path: string): boolean {
  return pathSegments(path).some((s) => s.startsWith('.'));
}

// Paths under .tactile are internal storage (settings, version history,
// trash) except daily notes, which are user-visible files that happen to
// live there.
export function isInternalPath(path: string): boolean {
  const segments = pathSegments(path);
  const tactileIndex = segments.indexOf('.tactile');
  if (tactileIndex === -1) return false;
  return segments[tactileIndex + 1] !== 'daily';
}

// FNV-1a 32 bit hash, hex encoded. Used for stable directory names where the
// real path would be too long or unsafe as a directory name. crypto.subtle is
// deliberately avoided so this also works in non-secure contexts.
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// Encode an arbitrary absolute path as a single safe directory name.
export function encodePathAsDir(path: string): string {
  const normalized = normalizePath(path);
  return `${encodeURIComponent(normalized).slice(0, 120)}-${fnv1a(normalized)}`;
}
