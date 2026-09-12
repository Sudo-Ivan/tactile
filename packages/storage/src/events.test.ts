import { describe, expect, it, vi } from 'vitest';
import { ChangeEmitter } from './events';
import type { ChangeEvent } from './types';

const sample: ChangeEvent = { path: '/a.md', kind: 'write', origin: 'local' };

describe('ChangeEmitter', () => {
  it('delivers events to subscribers', () => {
    const emitter = new ChangeEmitter();
    const seen: ChangeEvent[] = [];
    emitter.onDidChange((e) => seen.push(e));
    emitter.emit(sample);
    emitter.emit({ ...sample, kind: 'delete' });
    expect(seen).toEqual([sample, { ...sample, kind: 'delete' }]);
  });

  it('supports multiple listeners', () => {
    const emitter = new ChangeEmitter();
    const a: ChangeEvent[] = [];
    const b: ChangeEvent[] = [];
    emitter.onDidChange((e) => a.push(e));
    emitter.onDidChange((e) => b.push(e));
    emitter.emit(sample);
    expect(a).toEqual([sample]);
    expect(b).toEqual([sample]);
  });

  it('stops delivering after unsubscribe', () => {
    const emitter = new ChangeEmitter();
    const seen: ChangeEvent[] = [];
    const off = emitter.onDidChange((e) => seen.push(e));
    emitter.emit(sample);
    off();
    emitter.emit(sample);
    expect(seen).toEqual([sample]);
  });

  it('a throwing listener does not prevent delivery to the others', () => {
    const emitter = new ChangeEmitter();
    const seen: ChangeEvent[] = [];
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    emitter.onDidChange(() => {
      throw new Error('boom');
    });
    emitter.onDidChange((e) => seen.push(e));
    emitter.emit(sample);
    expect(seen).toEqual([sample]);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
