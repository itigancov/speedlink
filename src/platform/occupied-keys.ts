// The content script's read-only cache of occupied keys, so keydown can decide synchronously (product spec §4.2).

import type { Keymap } from '@/domain/keymap-ops';
import type { Key } from '@/domain/keys';
import { readKeymap, watchKeymap } from './keymap-store';

export interface OccupiedKeys {
  /** True for every key until `ready`: the background, which knows the truth, opens it or shows the free-key toast. */
  isAssigned(key: Key): boolean;
  /** Calls back after every keymap change (not the first read); returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Resolves once the first read has landed. */
  readonly ready: Promise<void>;
  /** Stops listening for keymap changes. */
  dispose(): void;
}

export function createOccupiedKeys(): OccupiedKeys {
  let keymap: Keymap | null = null;
  const listeners = new Set<() => void>();
  const unwatch = watchKeymap((next) => {
    keymap = next;
    for (const listener of listeners) listener();
  });
  const ready = readKeymap().then((first) => {
    keymap ??= first;
  });
  return {
    isAssigned: (key) => keymap === null || keymap[key] !== undefined,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ready,
    dispose: () => {
      listeners.clear();
      unwatch();
    },
  };
}
