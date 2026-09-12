import { EventedBackend } from './events';
import type { BackendOptions, ChangeEvent, DirEntry, FileStat, StorageBackend } from './types';

interface BroadcastMessage {
  sender: string;
  event: ChangeEvent;
}

// Wraps a backend so every change event is also posted to a BroadcastChannel
// shared by all tabs of this origin. Remote events are re-emitted locally,
// which gives cross-tab live refresh even though OPFS itself has no watcher.
//
// - Events are deduplicated by sender id so a tab never receives its own
//   writes twice.
// - The channel is namespaced per storage root so two apps on the same
//   origin do not cross-talk.
// - Delivery is best effort. It is a refresh hint, not a data channel: the
//   event only carries paths, and listeners re-read from storage.
// - The event origin tag travels with the message, so a write applied by the
//   sync layer in one tab arrives as 'sync' in every other tab.
export class BroadcastBackend extends EventedBackend implements StorageBackend {
  readonly name: string;

  private channel: BroadcastChannel | null = null;
  private sender: string;

  constructor(
    private inner: StorageBackend,
    scope = 'tactile'
  ) {
    super();
    this.name = `${inner.name}+broadcast`;
    this.sender =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`tactile:storage:${scope}`);
      this.channel.onmessage = (message: MessageEvent<BroadcastMessage>) => {
        const data = message.data;
        if (!data || data.sender === this.sender) return;
        this.emit(data.event);
      };
    }

    this.inner.onDidChange((event) => {
      this.emit(event);
      this.channel?.postMessage({ sender: this.sender, event } satisfies BroadcastMessage);
    });
  }

  readDir(path: string, options?: BackendOptions): Promise<DirEntry[]> {
    return this.inner.readDir(path, options);
  }
  readFile(path: string, options?: BackendOptions): Promise<Uint8Array> {
    return this.inner.readFile(path, options);
  }
  readTextFile(path: string, options?: BackendOptions): Promise<string> {
    return this.inner.readTextFile(path, options);
  }
  writeTextFile(path: string, contents: string, options?: BackendOptions): Promise<void> {
    return this.inner.writeTextFile(path, contents, options);
  }
  writeFile(path: string, contents: Uint8Array, options?: BackendOptions): Promise<void> {
    return this.inner.writeFile(path, contents, options);
  }
  mkdir(path: string, options?: BackendOptions): Promise<void> {
    return this.inner.mkdir(path, options);
  }
  rename(from: string, to: string, options?: BackendOptions): Promise<void> {
    return this.inner.rename(from, to, options);
  }
  remove(path: string, options?: BackendOptions): Promise<void> {
    return this.inner.remove(path, options);
  }
  stat(path: string, options?: BackendOptions): Promise<FileStat> {
    return this.inner.stat(path, options);
  }
  exists(path: string, options?: BackendOptions): Promise<boolean> {
    return this.inner.exists(path, options);
  }
}
