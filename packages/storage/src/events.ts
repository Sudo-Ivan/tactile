import type { ChangeEvent, Unsubscribe } from './types';

export class ChangeEmitter {
  private listeners = new Set<(event: ChangeEvent) => void>();

  onDidChange(cb: (event: ChangeEvent) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(event: ChangeEvent): void {
    for (const cb of this.listeners) {
      try {
        cb(event);
      } catch (error) {
        console.error('storage: change listener failed', error);
      }
    }
  }
}

// Base class with event plumbing wired in. Backends extend this and call
// this.emitChange after every successful mutation.
export abstract class EventedBackend extends ChangeEmitter {
  protected emitChange(event: ChangeEvent): void {
    this.emit(event);
  }
}
