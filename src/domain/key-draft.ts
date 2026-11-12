// The Options inspector's edit of one key (product spec §8.3, §8.4): raw field values, checked against the stored
// shortcut before autosave writes them, and merged with changes that arrive from storage.
import { normalizeLink } from './link';
import {
  DEFAULT_OPEN_MODE,
  DEFAULT_TAB_MATCH,
  type OpenMode,
  type Shortcut,
  type TabMatch,
  validateShortcut,
} from './shortcut';

/** The inspector's fields as typed: the link and name are raw text, an empty name means "show the site". */
export interface KeyDraft {
  link: string;
  name: string;
  openMode: OpenMode;
  tabMatch: TabMatch;
  closeCurrent: boolean;
}

/**
 * `same`: nothing to write. `valid`: the shortcut to write. `invalid`: nothing may be written; `showError` is false
 * only for a free key whose link is still empty, which is unfinished rather than wrong.
 */
export type DraftCheck =
  | { kind: 'same' }
  | { kind: 'valid'; shortcut: Shortcut }
  | { kind: 'invalid'; showError: boolean };

/** The draft that shows a stored shortcut; a free key gets an empty link and the defaults. */
export function draftOf(stored: Shortcut | undefined): KeyDraft {
  return {
    link: stored?.link ?? '',
    name: stored?.name ?? '',
    openMode: stored?.openMode ?? DEFAULT_OPEN_MODE,
    tabMatch: stored?.tabMatch ?? DEFAULT_TAB_MATCH,
    closeCurrent: stored?.closeCurrent ?? false,
  };
}

const sameFields = (a: KeyDraft, b: KeyDraft): boolean =>
  a.link === b.link &&
  a.name === b.name &&
  a.openMode === b.openMode &&
  a.tabMatch === b.tabMatch &&
  a.closeCurrent === b.closeCurrent;

/** Validates the draft over the stored shortcut, so fields a newer version stored are carried through. */
export function checkDraft(draft: KeyDraft, stored: Shortcut | undefined): DraftCheck {
  const result = validateShortcut({ ...stored, ...draft });
  if (!result.ok) {
    const unfinished = stored === undefined && draft.link.trim() === '';
    return sameFields(draft, draftOf(stored)) ? { kind: 'same' } : { kind: 'invalid', showError: !unfinished };
  }
  if (stored !== undefined && sameFields(draftOf(result.value), draftOf(stored))) return { kind: 'same' };
  return { kind: 'valid', shortcut: result.value };
}

/**
 * The next draft after the key's stored value changed (another device, or this page's own write). A clean draft
 * shows the new value; a dirty one is kept, also when the key was cleared, and its next save wins.
 */
export function mergeRemote(draft: KeyDraft, dirty: boolean, stored: Shortcut | undefined): KeyDraft {
  return dirty ? draft : draftOf(stored);
}

/** The inspector's status line after "⌥ Option + K ·". */
export type KeyStatus = { kind: 'free' } | { kind: 'open' } | { kind: 'mode'; openMode: OpenMode };

export function keyStatus(stored: Shortcut | undefined, openNow: boolean): KeyStatus {
  if (stored === undefined) return { kind: 'free' };
  return openNow ? { kind: 'open' } : { kind: 'mode', openMode: stored.openMode };
}

/** The link the tab match hint talks about: the draft's while valid, else the stored one; null hides the hint. */
export function hintLink(draft: KeyDraft, stored: Shortcut | undefined): string | null {
  const normalized = normalizeLink(draft.link);
  return normalized.ok ? normalized.value : (stored?.link ?? null);
}
