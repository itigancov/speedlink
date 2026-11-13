// Every operation returns a KeymapChange holding only the touched keys (docs/adr/0001-keymap-change.md).
import { moveTarget } from './fitting-keys';
import type { Key } from './keys';
import type { Result } from './result';
import type { Shortcut } from './shortcut';

/** The shortcuts on keys. A free key has no entry. */
export type Keymap = Readonly<Partial<Record<Key, Shortcut>>>;

/** The touched keys only: a shortcut writes the key, null frees it. The store writes it as one write. */
export type KeymapChange = Partial<Record<Key, Shortcut | null>>;

export type AssignResult =
  | { readonly kind: 'written'; readonly change: KeymapChange }
  | { readonly kind: 'conflict'; readonly existing: Shortcut; readonly moveTarget: Key | null };

/** How an assign onto an occupied key is resolved: drop the old shortcut, or move it to its Move target. */
export type Resolve = 'replace' | 'move';

export type MoveError = 'source-free' | 'target-occupied';

export function applyChange(keymap: Keymap, change: KeymapChange): Keymap {
  const next: Partial<Record<Key, Shortcut>> = { ...keymap };
  for (const [key, shortcut] of Object.entries(change) as [Key, Shortcut | null][]) {
    if (shortcut === null) delete next[key];
    else next[key] = shortcut;
  }
  return next;
}

/**
 * Puts a shortcut on a key. A free key is written; an occupied key is a conflict unless resolved by Replace
 * (the old shortcut is dropped) or Move (the old shortcut goes to its Move target, if a key is free).
 */
export function assign(keymap: Keymap, key: Key, shortcut: Shortcut, resolve?: Resolve): AssignResult {
  const existing = keymap[key];
  if (existing === undefined || resolve === 'replace') return { kind: 'written', change: { [key]: shortcut } };

  const target = moveTarget(keymap, existing);
  if (resolve !== 'move' || target === null) return { kind: 'conflict', existing, moveTarget: target };
  return { kind: 'written', change: { [key]: shortcut, [target]: existing } };
}

/** Writes the key whatever it holds: Options autosave, never a conflict. */
export function put(key: Key, shortcut: Shortcut): KeymapChange {
  return { [key]: shortcut };
}

/** Exchanges the contents of two keys; with one free key this moves the shortcut. */
export function swap(keymap: Keymap, a: Key, b: Key): KeymapChange {
  const atA = keymap[a];
  const atB = keymap[b];
  if (a === b || (atA === undefined && atB === undefined)) return {};
  return { [a]: atB ?? null, [b]: atA ?? null };
}

/** Moves a shortcut onto a free key, freeing the source. */
export function move(keymap: Keymap, from: Key, to: Key): Result<KeymapChange, MoveError> {
  const shortcut = keymap[from];
  if (shortcut === undefined) return { ok: false, error: 'source-free' };
  if (keymap[to] !== undefined) return { ok: false, error: 'target-occupied' };
  return { ok: true, value: { [from]: null, [to]: shortcut } };
}

/**
 * Drag-to-swap's drop: a swap onto a key that holds a shortcut, a move onto a free key. Null when there is nothing
 * to carry (the source is free) or nowhere to go (the source itself).
 */
export function dropChange(keymap: Keymap, from: Key, to: Key): KeymapChange | null {
  if (keymap[from] === undefined || from === to) return null;
  if (keymap[to] !== undefined) return swap(keymap, from, to);
  const moved = move(keymap, from, to);
  return moved.ok ? moved.value : null;
}

/** Frees the key; an already free key gives an empty change. */
export function clear(keymap: Keymap, key: Key): KeymapChange {
  return keymap[key] === undefined ? {} : { [key]: null };
}
