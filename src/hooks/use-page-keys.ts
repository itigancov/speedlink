// ⌥+key on SpeedLink's own pages, Options and welcome (product spec §4.6, §8.8): the content script can't run there,
// so the page classifies the keydown itself, with the same decision as everywhere else, and maps it to page actions.
import { useEffect, useRef } from 'react';
import { classifyKeydown } from '@/domain/keydown';
import type { Keymap } from '@/domain/keymap-ops';
import type { Key } from '@/domain/keys';
import { keyInput, swallow } from '@/platform/key-capture';
import { sendMessage } from '@/platform/messaging';
import { browserOs } from '@/platform/platform-labels';

export interface PageKeys {
  /** The page's live keymap; null until it has loaded, which leaves every key alone. */
  keymap: Keymap | null;
  /** ⌥ + a free key. */
  onFree(key: Key): void;
  /** ⌥S. */
  onReserved(): void;
}

/**
 * Registers one `keydown` listener on the document. An assigned key opens as Try ⌥K does (`tryKey`, so the page is
 * never replaced or closed; ⇧ is Force new tab); a `free` reply, from a stale keymap, is handled as a free key. The
 * page's own fields, AltGr, IME and the browser's own Alt keys keep their meaning, since the domain's classification
 * is the same one the content script uses.
 */
export function usePageKeys(keys: PageKeys): void {
  const latest = useRef(keys);
  latest.current = keys;

  useEffect(() => {
    const os = browserOs();
    const onKeyDown = (event: KeyboardEvent) => {
      const { keymap, onFree, onReserved } = latest.current;
      if (keymap === null) return;
      const decision = classifyKeydown(keyInput(event), os, (key) => keymap[key] !== undefined);
      if (decision.kind === 'ignore' || decision.kind === 'pass') return;

      swallow(event);
      if (decision.kind === 'reserved') return onReserved();
      if (decision.kind !== 'open') return;
      const { key, force } = decision;
      if (keymap[key] === undefined) return onFree(key);
      sendMessage('tryKey', { key, force })
        .then((reply) => {
          // The key was freed since this page last saw it: act as for a free key.
          if (reply.kind === 'free') onFree(key);
          else if (reply.kind === 'failed') console.error('SpeedLink: could not open', key);
        })
        .catch((error: unknown) => console.error('SpeedLink: could not reach the background', key, error));
    };
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);
}
