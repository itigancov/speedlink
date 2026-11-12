import { useEffect, useState } from 'react';
import type { Keymap } from '@/domain/keymap-ops';
import { readKeymap, watchKeymap } from '@/platform/keymap-store';

/** The live keymap, local and remote changes alike; null until the first read has landed. */
export function useKeymap(): Keymap | null {
  const [keymap, setKeymap] = useState<Keymap | null>(null);
  useEffect(() => {
    const unwatch = watchKeymap(setKeymap);
    // A watch emission is newer than this first read, so it wins.
    void readKeymap().then((first) => setKeymap((current) => current ?? first));
    return unwatch;
  }, []);
  return keymap;
}
