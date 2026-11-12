// The only module that reads or writes `key.<K>` items in storage.sync (product spec §3, ADR 0001).

import type { Keymap, KeymapChange } from '@/domain/keymap-ops';
import { KEYBOARD_ORDER, type Key } from '@/domain/keys';
import type { Result } from '@/domain/result';
import { parseShortcut, type Shortcut } from '@/domain/shortcut';

const itemName = (key: Key) => `key.${key}` as const;
const storageKey = (key: Key) => `sync:${itemName(key)}` as const;

const STORAGE_KEYS = KEYBOARD_ORDER.map(storageKey);
const ITEM_NAMES: ReadonlySet<string> = new Set(KEYBOARD_ORDER.map(itemName));

/** Read tolerant: an unreadable item is left out, so its key looks free, and stays in storage untouched. */
export async function readKeymap(): Promise<Keymap> {
  const items = await storage.getItems(STORAGE_KEYS);
  const keymap: Partial<Record<Key, Shortcut>> = {};
  items.forEach(({ value }, index) => {
    const shortcut = parseShortcut(value);
    if (shortcut !== null) keymap[KEYBOARD_ORDER[index] as Key] = shortcut;
  });
  return keymap;
}

/**
 * Calls back with the full keymap once per storage.sync change that touches a key, local or remote alike.
 * Changes to other items are ignored. Returns the unsubscribe.
 */
export function watchKeymap(callback: (keymap: Keymap) => void): () => void {
  let active = true;
  const listener = (changes: Record<string, unknown>) => {
    if (!Object.keys(changes).some((name) => ITEM_NAMES.has(name))) return;
    void readKeymap().then((keymap) => {
      if (active) callback(keymap);
    });
  };
  browser.storage.sync.onChanged.addListener(listener);
  return () => {
    active = false;
    browser.storage.sync.onChanged.removeListener(listener);
  };
}

export type WriteError = 'quota-exceeded' | 'write-failed';

const OK: Result<void, WriteError> = { ok: true, value: undefined };

/**
 * Write strict (the `Shortcut` brand is the validation): shortcuts in one bulk set, then frees in one bulk
 * remove. Set first, so a crash mid-Move leaves a duplicate, never a lost shortcut. Not atomic: a change with
 * both produces two change events, each a coherent keymap.
 */
export async function writeChange(change: KeymapChange): Promise<Result<void, WriteError>> {
  const entries = Object.entries(change) as [Key, Shortcut | null][];
  const sets = entries.flatMap(([key, value]) => (value === null ? [] : [{ key: storageKey(key), value }]));
  const removes = entries.flatMap(([key, value]) => (value === null ? [storageKey(key)] : []));
  try {
    await storage.setItems(sets);
    await storage.removeItems(removes);
    return OK;
  } catch (error) {
    return { ok: false, error: toWriteError(error) };
  }
}

/** Frees every key. Only `key.*` items go: `meta`, v1's `speedlink` and legacy `shortcuts` stay. */
export async function clearAll(): Promise<Result<void, WriteError>> {
  try {
    await storage.removeItems(STORAGE_KEYS);
    return OK;
  } catch (error) {
    return { ok: false, error: toWriteError(error) };
  }
}

/** Chrome reports quota and rate limits only through the error message (`QUOTA_BYTES…`, `MAX_WRITE_OPERATIONS…`). */
function toWriteError(error: unknown): WriteError {
  const message = error instanceof Error ? error.message : String(error);
  return /QUOTA_BYTES|MAX_ITEMS|MAX_WRITE_OPERATIONS|MAX_SUSTAINED_WRITE_OPERATIONS/.test(message)
    ? 'quota-exceeded'
    : 'write-failed';
}
