import type { Keymap } from './keymap-ops';
import { KEYBOARD_ORDER, type Key } from './keys';

/** Options searches key, name and link over all 35 keys; the overlay searches name and link of assigned keys. */
export type SearchScope = 'options' | 'overlay';

/** Whether a shortcut's name or link holds `needle`, which is already trimmed and lowercased. */
const holds = ({ name, link }: { name?: string; link: string }, needle: string) =>
  (name ?? '').toLowerCase().includes(needle) || link.toLowerCase().includes(needle);

/** Keys matching a case-insensitive query, in keyboard order. An empty query lists everything the scope shows. */
export function searchKeymap(keymap: Keymap, query: string, scope: SearchScope): Key[] {
  const needle = query.trim().toLowerCase();
  return KEYBOARD_ORDER.filter((key) => {
    const shortcut = keymap[key];
    if (needle === '') return scope === 'options' || shortcut !== undefined;
    if (scope === 'options' && key.toLowerCase() === needle) return true;
    if (shortcut === undefined) return false;
    return holds(shortcut, needle);
  });
}

/** The overlay's tiles matching a query, as the overlay search of the keymap: name and link, never the key letter. */
export function searchTiles<T extends { name: string; link: string }>(tiles: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  return tiles.filter((tile) => needle === '' || holds(tile, needle));
}

/**
 * The key ↵ picks in the Options search: the key named exactly by the query, otherwise the first match in keyboard
 * order. With `assignedOnly` (List view), only assigned keys count. A blank query picks nothing.
 */
export function enterTarget(keymap: Keymap, query: string, { assignedOnly }: { assignedOnly: boolean }): Key | null {
  const needle = query.trim().toLowerCase();
  if (needle === '') return null;
  const candidates = searchKeymap(keymap, needle, 'options').filter(
    (key) => !assignedOnly || keymap[key] !== undefined,
  );
  return candidates.find((key) => key.toLowerCase() === needle) ?? candidates[0] ?? null;
}
