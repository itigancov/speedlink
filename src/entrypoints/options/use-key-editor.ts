// The selected key and its draft (product spec §8.2, §8.4): selection from `#key=K` or none, mirrored back to the
// hash, and remote changes merged into the draft.
import { useCallback, useEffect, useState } from 'react';
import { checkDraft, draftOf, type KeyDraft, mergeRemote } from '@/domain/key-draft';
import type { Keymap } from '@/domain/keymap-ops';
import { KEYBOARD_ORDER, type Key } from '@/domain/keys';
import type { Shortcut } from '@/domain/shortcut';

interface Editing {
  key: Key;
  draft: KeyDraft;
  /** The stored shortcut the draft was last merged with, to tell a remote change from an edit. */
  base: Shortcut | undefined;
  /** Clear key was pressed and storage hasn't echoed it yet: the key already shows as free. */
  clearing: boolean;
}

const HASH = /^#key=([A-Z0-9])$/;

/** The key in `#key=K`, or null for anything else, S included. */
export function keyFromHash(hash: string): Key | null {
  const label = HASH.exec(hash)?.[1];
  return KEYBOARD_ORDER.find((key) => key === label) ?? null;
}

const editingOf = (key: Key, stored: Shortcut | undefined): Editing => ({
  key,
  draft: draftOf(stored),
  base: stored,
  clearing: false,
});

/** The URL's hash: `#key=K` for a selection, none without one. */
export function hashFor(key: Key | null): string {
  const { pathname, search } = window.location;
  return `${pathname}${search}${key === null ? '' : `#key=${key}`}`;
}

export interface KeyEditor {
  /** The selected key, or null when nothing is selected and the editor is closed. */
  key: Key | null;
  /** The selected key's draft; null without a selection. */
  draft: KeyDraft | null;
  /** The selected key's shortcut as the editor shows it: undefined while a Clear key is on its way to storage. */
  stored: Shortcut | undefined;
  /** Selects the key; already selected, it stays so. */
  select(key: Key): void;
  /** A click on a key: selects it, or closes the editor when it is the selected key. */
  toggle(key: Key): void;
  /** Ends the selection. Like a key switch, autosave still writes a valid draft; an invalid one is dropped. */
  close(): void;
  /** Selects the key with its draft reset to storage, even when it is already selected: after a drop writes it. */
  reselect(key: Key): void;
  setDraft(draft: KeyDraft): void;
  /** Shows the key as free at once, ahead of the storage echo; `failed` undoes that when the write fails. */
  markCleared(): { failed(): void };
}

export function useKeyEditor(keymap: Keymap): KeyEditor {
  const [editing, setEditing] = useState<Editing | null>(() => {
    const key = keyFromHash(window.location.hash);
    return key === null ? null : editingOf(key, keymap[key]);
  });

  let current = editing;
  let stored: Shortcut | undefined;
  if (current !== null) {
    const actual = keymap[current.key];
    if (current.clearing && actual === undefined) current = { ...current, clearing: false };
    stored = current.clearing ? undefined : actual;
    if (stored !== current.base) {
      const dirty = checkDraft(current.draft, current.base).kind !== 'same';
      current = { ...current, draft: mergeRemote(current.draft, dirty, stored), base: stored };
    }
  }
  // Adjusting state while rendering: React re-renders at once, before the effects run.
  if (current !== editing) setEditing(current);

  const select = useCallback(
    (key: Key) => setEditing((prev) => (prev?.key === key ? prev : editingOf(key, keymap[key]))),
    [keymap],
  );

  const toggle = useCallback(
    (key: Key) => setEditing((prev) => (prev?.key === key ? null : editingOf(key, keymap[key]))),
    [keymap],
  );

  const close = useCallback(() => setEditing(null), []);

  const reselect = useCallback((key: Key) => setEditing(editingOf(key, keymap[key])), [keymap]);

  useEffect(() => {
    const onHashChange = () => {
      const key = keyFromHash(window.location.hash);
      if (key !== null) select(key);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [select]);

  const key = current?.key ?? null;
  useEffect(() => {
    window.history.replaceState(window.history.state, '', hashFor(key));
  }, [key]);

  const setDraft = useCallback(
    (draft: KeyDraft) => setEditing((prev) => (prev === null ? prev : { ...prev, draft })),
    [],
  );

  const markCleared = () => {
    setEditing((prev) =>
      prev === null ? prev : { ...prev, draft: draftOf(undefined), base: undefined, clearing: true },
    );
    return {
      failed: () => setEditing((prev) => (prev !== null && prev.key === key ? { ...prev, clearing: false } : prev)),
    };
  };

  return { key, draft: current?.draft ?? null, stored, select, toggle, close, reselect, setDraft, markCleared };
}
