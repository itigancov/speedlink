// Putting a tab's page on a key, and taking it back (product spec §2.5, §3.3): pure plans, executed by the background.
import { assign, type Keymap, type KeymapChange } from './keymap-ops';
import type { Key } from './keys';
import { isRestrictedUrl } from './restricted';
import { DEFAULT_OPEN_MODE, DEFAULT_TAB_MATCH, type OpenMode, type Shortcut, validateShortcut } from './shortcut';

/** The tab's page as SpeedLink read it from the tabs API, never from the page. */
export interface TabPage {
  url: string;
  /** The tab title, '' when Chrome gives none. */
  title: string;
}

export interface AssignOptions {
  openMode?: OpenMode;
  resolve?: 'replace' | 'move';
}

/** How to take an assign back: what every touched key held before (null = free), and what the assign wrote. */
export interface AssignUndo {
  keys: KeymapChange;
  written: KeymapChange;
}

export type AssignPlan =
  | { readonly kind: 'unusable' }
  | { readonly kind: 'conflict'; readonly existing: Shortcut; readonly moveTarget: Key | null }
  | {
      readonly kind: 'written';
      /** The new shortcut, as it goes on the key. */
      readonly shortcut: Shortcut;
      readonly change: KeymapChange;
      readonly undo: AssignUndo;
    };

/**
 * The shortcut a page becomes on a key: the page with the default settings (plus the open mode, when given), named
 * after the trimmed tab title; it never inherits a replaced shortcut's settings. Null for a page that isn't a usable
 * http(s) link, or that SpeedLink can't run on (§4.6).
 */
export function pageShortcut(page: TabPage, openMode: OpenMode = DEFAULT_OPEN_MODE): Shortcut | null {
  if (isRestrictedUrl(page.url)) return null;
  const shortcut = validateShortcut({
    link: page.url,
    name: page.title,
    openMode,
    tabMatch: DEFAULT_TAB_MATCH,
    closeCurrent: false,
  });
  return shortcut.ok ? shortcut.value : null;
}

/** Puts `pageShortcut` on the key; a page that can't go on one is `unusable`. A conflict is `assign`'s, passed through. */
export function planAssign(keymap: Keymap, key: Key, page: TabPage, options: AssignOptions = {}): AssignPlan {
  const shortcut = pageShortcut(page, options.openMode);
  if (shortcut === null) return { kind: 'unusable' };

  const result = assign(keymap, key, shortcut, options.resolve);
  if (result.kind === 'conflict') return result;
  const keys: KeymapChange = {};
  for (const touched of Object.keys(result.change) as Key[]) keys[touched] = keymap[touched] ?? null;
  return { kind: 'written', shortcut, change: result.change, undo: { keys, written: result.change } };
}

/**
 * How long the undo record is kept: a backstop only. What the user sees as the limit is the saved toast (5 s, held
 * while hovered); this keeps a record nobody replaced from being applied much later.
 */
export const UNDO_LIFETIME_MS = 60_000;

/** `storage.session`'s `undo` (product spec §3.3). `id` is fresh per assign, so only its own toast can undo it. */
export interface UndoRecord extends AssignUndo {
  id: string;
  expiresAt: number;
}

export type UndoPlan = { readonly kind: 'undone'; readonly change: KeymapChange } | { readonly kind: 'stale' };

export function undoRecord(undo: AssignUndo, id: string, now: number): UndoRecord {
  return { id, expiresAt: now + UNDO_LIFETIME_MS, ...undo };
}

/**
 * Puts the touched keys back, all or nothing: only when every one still holds exactly what the assign wrote (a
 * free key matching null), so a newer edit from Options, another tab or another device is never trampled. A
 * missing, expired or foreign record is `stale` too.
 */
export function planUndo(
  keymap: Keymap,
  record: UndoRecord | undefined,
  request: { id: string; now: number },
): UndoPlan {
  if (record === undefined || record.id !== request.id || request.now >= record.expiresAt) return { kind: 'stale' };
  const untouched = Object.entries(record.written).every(([key, wrote]) =>
    sameJson(keymap[key as Key] ?? null, wrote ?? null),
  );
  return untouched ? { kind: 'undone', change: record.keys } : { kind: 'stale' };
}

/** Structural equality of JSON values: a shortcut read back from storage equals the one written. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bRecord = b as Record<string, unknown>;
  return (
    aKeys.length === Object.keys(b).length &&
    aKeys.every((key) => Object.hasOwn(bRecord, key) && sameJson((a as Record<string, unknown>)[key], bRecord[key]))
  );
}
