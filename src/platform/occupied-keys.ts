// The content script's read-only cache of occupied keys, so keydown can decide synchronously (product spec §4.2).

import type { Keymap } from '@/domain/keymap-ops';
import type { Key } from '@/domain/keys';
import { readKeymap, watchKeymap } from './keymap-store';

export interface OccupiedKeys {
  /** True for every key until `ready`: the background, which knows the truth, opens it or shows the free-key toast. */
  isAssigned(key: Key): boolean;
  /** Resolves once the first read has landed. */
  readonly ready: Promise<void>;
  /** Stops listening for keymap changes. */
  dispose(): void;
}

export function createOccupiedKeys(): OccupiedKeys {
  let keymap: Keymap | null = null;
  const unwatch = watchKeymap((next) => {
    keymap = next;
  });
  const ready = readKeymap().then((first) => {
    keymap ??= first;
  });
  return {
    isAssigned: (key) => keymap === null || keymap[key] !== undefined,
    ready,
    dispose: unwatch,
  };
}
