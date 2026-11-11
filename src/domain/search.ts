import type { Keymap } from './keymap-ops';
import { KEYBOARD_ORDER, type Key } from './keys';

/** Options searches key, name and link over all 35 keys; the overlay searches name and link of assigned keys. */
export type SearchScope = 'options' | 'overlay';

/** Keys matching a case-insensitive query, in keyboard order. An empty query lists everything the scope shows. */
export function searchKeymap(keymap: Keymap, query: string, scope: SearchScope): Key[] {
  const needle = query.trim().toLowerCase();
  return KEYBOARD_ORDER.filter((key) => {
    const shortcut = keymap[key];
    if (needle === '') return scope === 'options' || shortcut !== undefined;
    if (scope === 'options' && key.toLowerCase() === needle) return true;
    if (shortcut === undefined) return false;
    return (shortcut.name ?? '').toLowerCase().includes(needle) || shortcut.link.toLowerCase().includes(needle);
  });
}
