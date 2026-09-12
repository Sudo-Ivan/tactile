import { describe, expect, it } from 'vitest';
import {
  baseName,
  encodePathAsDir,
  fnv1a,
  hasHiddenSegment,
  isInternalPath,
  isRoot,
  isUnder,
  joinPath,
  normalizePath,
  parentPath,
  pathSegments,
  StorageError
} from './paths';

describe('normalizePath', () => {
  it('returns / for the root', () => {
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('//')).toBe('/');
    expect(normalizePath('///')).toBe('/');
  });

  it('collapses duplicate slashes', () => {
    expect(normalizePath('/a//b///c.md')).toBe('/a/b/c.md');
  });

  it('removes trailing slashes', () => {
    expect(normalizePath('/a/b/')).toBe('/a/b');
  });

  it('skips dot segments', () => {
    expect(normalizePath('/a/./b/./c.md')).toBe('/a/b/c.md');
    expect(normalizePath('/./a')).toBe('/a');
  });

  it('adds a leading slash to relative input', () => {
    expect(normalizePath('a/b.md')).toBe('/a/b.md');
  });

  it('throws on path traversal', () => {
    expect(() => normalizePath('/a/../b')).toThrow(StorageError);
    expect(() => normalizePath('/..')).toThrow(StorageError);
    expect(() => normalizePath('..')).toThrow(StorageError);
  });

  it('throws on empty or non-string input', () => {
    expect(() => normalizePath('')).toThrow(StorageError);
    // @ts-expect-error intentionally wrong type
    expect(() => normalizePath(undefined)).toThrow(StorageError);
    // @ts-expect-error intentionally wrong type
    expect(() => normalizePath(null)).toThrow(StorageError);
  });

  it('tags errors with the invalid_path code', () => {
    try {
      normalizePath('/a/../b');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(StorageError);
      expect((error as StorageError).code).toBe('invalid_path');
      expect((error as StorageError).name).toBe('StorageError');
    }
  });

  it('keeps dotfile segments like .tactile', () => {
    expect(normalizePath('/a/.tactile/b')).toBe('/a/.tactile/b');
  });
});

describe('joinPath', () => {
  it('joins parts into a normalized path', () => {
    expect(joinPath('/a', 'b', 'c.md')).toBe('/a/b/c.md');
    expect(joinPath('/a/', '/b/')).toBe('/a/b');
    // No parts means an empty join, which is an invalid path.
    expect(() => joinPath()).toThrow(StorageError);
  });
});

describe('parentPath', () => {
  it('returns the parent directory', () => {
    expect(parentPath('/a/b/c.md')).toBe('/a/b');
    expect(parentPath('/a')).toBe('/');
    expect(parentPath('/')).toBe('/');
  });
});

describe('baseName', () => {
  it('returns the last segment', () => {
    expect(baseName('/a/b/c.md')).toBe('c.md');
    expect(baseName('/a')).toBe('a');
    expect(baseName('/')).toBe('');
  });
});

describe('isRoot and pathSegments', () => {
  it('detects the root', () => {
    expect(isRoot('/')).toBe(true);
    expect(isRoot('//')).toBe(true);
    expect(isRoot('/a')).toBe(false);
  });

  it('splits into segments', () => {
    expect(pathSegments('/a/b/c.md')).toEqual(['a', 'b', 'c.md']);
    expect(pathSegments('/')).toEqual([]);
  });
});

describe('isUnder', () => {
  it('matches equal paths and descendants', () => {
    expect(isUnder('/a/b', '/a/b')).toBe(true);
    expect(isUnder('/a/b/c', '/a/b')).toBe(true);
  });

  it('treats every path as under /', () => {
    expect(isUnder('/anything/at/all', '/')).toBe(true);
  });

  it('does not confuse name prefixes with nesting', () => {
    expect(isUnder('/abc', '/ab')).toBe(false);
    expect(isUnder('/a', '/a/b')).toBe(false);
  });
});

describe('hasHiddenSegment', () => {
  it('finds dotfile segments anywhere in the path', () => {
    expect(hasHiddenSegment('/a/.tactile/b')).toBe(true);
    expect(hasHiddenSegment('/.trash')).toBe(true);
    expect(hasHiddenSegment('/a/b/c.md')).toBe(false);
  });
});

describe('isInternalPath', () => {
  it('treats paths under .tactile as internal', () => {
    expect(isInternalPath('/.tactile/format.json')).toBe(true);
    expect(isInternalPath('/Notes/.tactile/versions/x')).toBe(true);
  });

  it('excludes daily notes which are user visible', () => {
    expect(isInternalPath('/.tactile/daily/2024-01-01.md')).toBe(false);
    expect(isInternalPath('/Notes/.tactile/daily/2024-01-01.md')).toBe(false);
  });

  it('treats normal files as external', () => {
    expect(isInternalPath('/Notes/a.md')).toBe(false);
    expect(isInternalPath('/')).toBe(false);
  });

  it('does not confuse similarly named segments with .tactile', () => {
    expect(isInternalPath('/Notes/tactile/a.md')).toBe(false);
  });
});

describe('fnv1a', () => {
  it('matches known FNV-1a 32 bit vectors', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
    expect(fnv1a('foobar')).toBe('bf9cf968');
  });

  it('is deterministic and always 8 hex chars', () => {
    const a = fnv1a('/Notes/a/b.md');
    const b = fnv1a('/Notes/a/b.md');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it('differs for different inputs', () => {
    expect(fnv1a('/a')).not.toBe(fnv1a('/b'));
  });
});

describe('encodePathAsDir', () => {
  it('encodes the path and appends the hash', () => {
    const encoded = encodePathAsDir('/Notes/a/b.md');
    // %2FNotes%2Fa%2Fb.md + '-' + 8 hex chars
    expect(encoded).toBe(`${encodeURIComponent('/Notes/a/b.md')}-5107d4f9`);
  });

  it('normalizes before encoding', () => {
    expect(encodePathAsDir('//Notes//a/')).toBe(encodePathAsDir('/Notes/a'));
  });

  it('produces a single safe directory name with no slashes', () => {
    expect(encodePathAsDir('/a/b/c/d.md')).not.toContain('/');
  });

  it('truncates the encoded portion at 120 chars but keeps the hash suffix', () => {
    const long = '/' + 'x'.repeat(500);
    const encoded = encodePathAsDir(long);
    // 120 encoded chars + '-' + 8 hex chars
    expect(encoded).toHaveLength(129);
    expect(encoded.endsWith(`-${fnv1a(long)}`)).toBe(true);
  });

  it('keeps distinct paths with the same 120 char prefix distinct via the hash', () => {
    const prefix = '/' + 'x'.repeat(200);
    const a = encodePathAsDir(prefix + 'a');
    const b = encodePathAsDir(prefix + 'b');
    expect(a).not.toBe(b);
    // The truncated prefixes are identical; only the hash differs.
    expect(a.slice(0, 120)).toBe(b.slice(0, 120));
  });

  it('rejects invalid input', () => {
    expect(() => encodePathAsDir('/a/../b')).toThrow(StorageError);
  });
});
