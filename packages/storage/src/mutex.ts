// Concurrency primitives.
//
// KeyedMutex serializes async operations per key (a path), so two writes to
// the same file cannot interleave within a tab. For operations spanning
// several keys (rename) all keys are locked in sorted order to avoid
// deadlock.
//
// withWebLock additionally serializes across tabs via the Web Locks API,
// which matters for OPFS where concurrent createWritable calls on the same
// file from two tabs would fail with NoModificationAllowedError.

export class KeyedMutex {
  private chains = new Map<string, Promise<unknown>>();

  runExclusive<T>(keys: string | string[], fn: () => Promise<T>): Promise<T> {
    const sorted = (Array.isArray(keys) ? [...keys] : [keys]).sort();
    const prior = sorted.map((key) => this.chains.get(key)).filter(Boolean) as Promise<unknown>[];

    // The chain tail must be registered synchronously, before any await.
    // Otherwise two concurrent callers both observe an empty chain and run
    // fn() in parallel, defeating the lock.
    const result = Promise.allSettled(prior).then(() => fn());
    const tail = result.then(
      () => undefined,
      () => undefined
    );
    for (const key of sorted) {
      this.chains.set(key, tail);
    }
    // Release keys once our tail settles and nobody has queued behind us.
    void tail.then(() => {
      for (const key of sorted) {
        if (this.chains.get(key) === tail) this.chains.delete(key);
      }
    });
    return result;
  }
}

declare const navigator: {
  locks?: {
    request<T>(name: string, callback: () => Promise<T>): Promise<T>;
  };
};

export async function withWebLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return fn();
  return locks.request(name, fn);
}
