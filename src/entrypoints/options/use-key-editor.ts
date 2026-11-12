// The selected key and its draft (product spec §8.2, §8.4): selection from `#key=K`, mirrored back to the hash, and
// remote changes merged into the draft.
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

/** `#key=K`, else the first assigned key in keyboard order, else `1`. */
function initialKey(keymap: Keymap): Key {
  return keyFromHash(window.location.hash) ?? KEYBOARD_ORDER.find((key) => keymap[key] !== undefined) ?? '1';
}

const editingOf = (key: Key, stored: Shortcut | undefined): Editing => ({
  key,
  draft: draftOf(stored),
  base: stored,
  clearing: false,
});

export interface KeyEditor {
  key: Key;
  draft: KeyDraft;
  /** The key's shortcut as the inspector shows it: undefined while a Clear key is on its way to storage. */
  stored: Shortcut | undefined;
  select(key: Key): void;
  /** Selects the key with its draft reset to storage, even when it is already selected: after a drop writes it. */
  reselect(key: Key): void;
  setDraft(draft: KeyDraft): void;
  /** Shows the key as free at once, ahead of the storage echo; `failed` undoes that when the write fails. */
  markCleared(): { failed(): void };
}

export function useKeyEditor(keymap: Keymap): KeyEditor {
  const [editing, setEditing] = useState<Editing>(() => {
    const key = initialKey(keymap);
    return editingOf(key, keymap[key]);
  });

  const actual = keymap[editing.key];
  let current = editing;
  if (current.clearing && actual === undefined) current = { ...current, clearing: false };
  const stored = current.clearing ? undefined : actual;
  if (stored !== current.base) {
    const dirty = checkDraft(current.draft, current.base).kind !== 'same';
    current = { ...current, draft: mergeRemote(current.draft, dirty, stored), base: stored };
  }
  // Adjusting state while rendering: React re-renders at once, before the effects run.
  if (current !== editing) setEditing(current);

  const select = useCallback(
    (key: Key) => setEditing((prev) => (prev.key === key ? prev : editingOf(key, keymap[key]))),
    [keymap],
  );

  const reselect = useCallback((key: Key) => setEditing(editingOf(key, keymap[key])), [keymap]);

  useEffect(() => {
    const onHashChange = () => {
      const key = keyFromHash(window.location.hash);
      if (key !== null) select(key);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [select]);

  useEffect(() => {
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}#key=${current.key}`);
  }, [current.key]);

  const setDraft = useCallback((draft: KeyDraft) => setEditing((prev) => ({ ...prev, draft })), []);

  const markCleared = () => {
    const { key } = current;
    setEditing((prev) => ({ ...prev, draft: draftOf(undefined), base: undefined, clearing: true }));
    return {
      failed: () => setEditing((prev) => (prev.key === key ? { ...prev, clearing: false } : prev)),
    };
  };

  return { key: current.key, draft: current.draft, stored, select, reselect, setDraft, markCleared };
}
