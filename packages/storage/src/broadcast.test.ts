import { afterEach, describe, expect, it, vi } from 'vitest';
import { BroadcastBackend } from './broadcast';
import { MemoryBackend } from './test-utils';
import type { ChangeEvent } from './types';

const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined';

function setup(scope?: string) {
  const inner = new MemoryBackend();
  const backend = new BroadcastBackend(inner, scope);
  return { inner, backend };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BroadcastBackend', () => {
  it('suffixes the inner backend name', () => {
    const { backend } = setup();
    expect(backend.name).toBe('memory+broadcast');
  });

  it('delegates operations to the inner backend', async () => {
    const { inner, backend } = setup();
    await backend.writeTextFile('/a.md', 'hello');
    expect(await inner.readTextFile('/a.md')).toBe('hello');
    expect(await backend.exists('/a.md')).toBe(true);
  });

  it('re-emits inner change events to local subscribers exactly once', async () => {
    const { backend } = setup();
    const seen: ChangeEvent[] = [];
    backend.onDidChange((e) => seen.push(e));
    await backend.writeTextFile('/a.md', 'hello');
    expect(seen).toEqual([{ path: '/a.md', kind: 'create', origin: 'local' }]);
  });

  it.skipIf(!hasBroadcastChannel)(
    'delivers events to another backend on the same scope',
    async () => {
      const { backend: a } = setup('shared-scope');
      const { backend: b } = setup('shared-scope');
      const received = new Promise<ChangeEvent>((resolve) => {
        b.onDidChange((e) => resolve(e));
      });
      await a.writeTextFile('/notes/x.md', 'hi');
      await expect(received).resolves.toEqual({
        path: '/notes/x.md',
        kind: 'create',
        origin: 'local'
      });
    }
  );

  it.skipIf(!hasBroadcastChannel)('preserves the origin tag across tabs', async () => {
    const { backend: a } = setup('origin-scope');
    const { backend: b } = setup('origin-scope');
    const received = new Promise<ChangeEvent>((resolve) => {
      b.onDidChange((e) => resolve(e));
    });
    await a.writeTextFile('/notes/x.md', 'hi', { origin: 'sync' });
    await expect(received).resolves.toMatchObject({ origin: 'sync' });
  });

  it.skipIf(!hasBroadcastChannel)('does not cross-talk between scopes', async () => {
    const { backend: a } = setup('scope-one');
    const { backend: b } = setup('scope-two');
    const seen: ChangeEvent[] = [];
    b.onDidChange((e) => seen.push(e));
    await a.writeTextFile('/a.md', 'hi');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen).toEqual([]);
  });

  it('still works when BroadcastChannel is unavailable', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const { inner, backend } = setup();
    const seen: ChangeEvent[] = [];
    backend.onDidChange((e) => seen.push(e));
    await backend.writeTextFile('/a.md', 'hello');
    expect(await inner.readTextFile('/a.md')).toBe('hello');
    expect(seen).toEqual([{ path: '/a.md', kind: 'create', origin: 'local' }]);
  });
});
