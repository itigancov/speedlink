// Editing a shortcut already on a key, from the popup's key card (product spec §7): pure plans, executed by the
// background. Each plan holds only the touched keys (docs/adr/0001-keymap-change.md).
import { type ChangeUndo, undoFor } from './assign-plan';
import type { Keymap, KeymapChange } from './keymap-ops';
import type { Key } from './keys';
import { isRestrictedUrl } from './restricted';
import { type OpenMode, type Shortcut, validateShortcut } from './shortcut';

/** The key is free: nothing to edit. */
export interface MissingPlan {
  readonly kind: 'missing';
}

/** A change to write; `undo` only for the edits that can be undone (Remove, Move). */
export interface WrittenPlan {
  readonly kind: 'written';
  readonly change: KeymapChange;
}

export interface UndoablePlan extends WrittenPlan {
  readonly undo: ChangeUndo;
}

export function planSetOpenMode(keymap: Keymap, key: Key, openMode: OpenMode): MissingPlan | WrittenPlan {
  const shortcut = keymap[key];
  if (shortcut === undefined) return { kind: 'missing' };
  return { kind: 'written', change: { [key]: { ...shortcut, openMode } } };
}

export function planRemove(keymap: Keymap, key: Key): MissingPlan | UndoablePlan {
  if (keymap[key] === undefined) return { kind: 'missing' };
  const change: KeymapChange = { [key]: null };
  return { kind: 'written', change, undo: undoFor(keymap, change) };
}

export type MovePlan =
  | MissingPlan
  /** `to` is `from`: nothing to move. */
  | { readonly kind: 'refused' }
  | { readonly kind: 'conflict'; readonly existing: Shortcut }
  | (UndoablePlan & { /** The moved shortcut. */ readonly shortcut: Shortcut });

/**
 * Moves the shortcut on `from` to `to`. A taken target is a conflict unless resolved by `replace`: its old shortcut
 * is dropped, never swapped onto `from`.
 */
export function planMove(keymap: Keymap, from: Key, to: Key, resolve?: 'replace'): MovePlan {
  const shortcut = keymap[from];
  if (shortcut === undefined) return { kind: 'missing' };
  if (to === from) return { kind: 'refused' };
  const existing = keymap[to];
  if (existing !== undefined && resolve !== 'replace') return { kind: 'conflict', existing };
  const change: KeymapChange = { [from]: null, [to]: shortcut };
  return { kind: 'written', shortcut, change, undo: undoFor(keymap, change) };
}

/**
 * Points the key at the tab's exact page: its link becomes the tab URL and the tab match `exact`; name, open mode
 * and close current stay. A tab URL that isn't a usable link is `unusable`.
 */
export function planExactPage(
  keymap: Keymap,
  key: Key,
  tabUrl: string,
): MissingPlan | { kind: 'unusable' } | WrittenPlan {
  const shortcut = keymap[key];
  if (shortcut === undefined) return { kind: 'missing' };
  if (isRestrictedUrl(tabUrl)) return { kind: 'unusable' };
  const edited = validateShortcut({ ...shortcut, link: tabUrl, tabMatch: 'exact' });
  if (!edited.ok) return { kind: 'unusable' };
  return { kind: 'written', change: { [key]: edited.value } };
}
