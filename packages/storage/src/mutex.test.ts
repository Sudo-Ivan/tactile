import { describe, expect, it } from 'vitest';
import { KeyedMutex, withWebLock } from './mutex';

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (error?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  // Let queued microtasks (mutex chaining) run.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('KeyedMutex', () => {
  it('serializes operations on the same key', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    const gate = deferred();

    const first = mutex.runExclusive('/a.md', async () => {
      order.push('first:start');
      await gate.promise;
      order.push('first:end');
    });
    const second = mutex.runExclusive('/a.md', async () => {
      order.push('second:start');
    });

    await flush();
    // The second operation must not start while the first is pending.
    expect(order).toEqual(['first:start']);
    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('runs operations on different keys in parallel', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    const gate = deferred();

    const first = mutex.runExclusive('/a.md', async () => {
      order.push('a:start');
      await gate.promise;
      order.push('a:end');
    });
    const second = mutex.runExclusive('/b.md', async () => {
      order.push('b:start');
    });

    await flush();
    expect(order).toEqual(['a:start', 'b:start']);
    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['a:start', 'b:start', 'a:end']);
  });

  it('waits on all prior keys for multi-key operations', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    const gate = deferred();

    const first = mutex.runExclusive('/a.md', async () => {
      order.push('a:start');
      await gate.promise;
      order.push('a:end');
    });
    const both = mutex.runExclusive(['/a.md', '/b.md'], async () => {
      order.push('both:start');
    });

    await flush();
    expect(order).toEqual(['a:start']);
    gate.resolve();
    await Promise.all([first, both]);
    expect(order).toEqual(['a:start', 'a:end', 'both:start']);
  });

  it('does not deadlock when callers pass the same keys in different orders', async () => {
    const mutex = new KeyedMutex();
    const results = await Promise.all([
      mutex.runExclusive(['/b.md', '/a.md'], async () => 'one'),
      mutex.runExclusive(['/a.md', '/b.md'], async () => 'two')
    ]);
    expect(results.sort()).toEqual(['one', 'two']);
  });

  it('propagates fn errors and still runs queued operations', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];

    const failing = mutex.runExclusive('/a.md', async () => {
      throw new Error('nope');
    });
    const next = mutex.runExclusive('/a.md', async () => {
      order.push('next');
      return 'ok';
    });

    await expect(failing).rejects.toThrow('nope');
    await expect(next).resolves.toBe('ok');
    expect(order).toEqual(['next']);
  });

  it('returns the fn result', async () => {
    const mutex = new KeyedMutex();
    await expect(mutex.runExclusive('/a.md', async () => 42)).resolves.toBe(42);
  });
});

describe('withWebLock', () => {
  it('runs fn directly when the Web Locks API is unavailable', async () => {
    // Node has no navigator.locks, so this exercises the fallback path.
    await expect(withWebLock('tactile:test', async () => 'ran')).resolves.toBe('ran');
  });
});
