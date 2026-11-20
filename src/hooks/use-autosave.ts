// Options autosave (product spec §8.4): a valid draft is written ~400 ms after the last edit, an invalid one never.
import { useCallback, useEffect, useRef, useState } from 'react';
import { checkDraft, type DraftCheck, type KeyDraft } from '@/domain/key-draft';
import { put } from '@/domain/keymap-ops';
import type { Key } from '@/domain/keys';
import type { Shortcut } from '@/domain/shortcut';
import { writeChange } from '@/platform/keymap-store';

export const AUTOSAVE_MS = 400;

/**
 * `saved`: the draft matches storage (a write counts once storage echoes it). `pending`: a valid edit is waiting or
 * being written. `invalid`: the draft can't be stored and nothing is written. `error`: the last write failed.
 */
export type SaveState = 'saved' | 'pending' | 'invalid' | 'error';

export interface Autosave {
  state: SaveState;
  /** Writes a pending valid draft now; resolves at once, writing nothing, when there is none. */
  flush(): Promise<void>;
  /** Drops a pending write, for Clear key. */
  cancel(): void;
}

interface Pending {
  key: Key;
  shortcut: Shortcut;
}

/**
 * Saves the selected key's draft over its stored shortcut. When the key changes or the selection ends (null), a
 * pending valid draft is still written to the key it was made on; an invalid one was never pending, so it is
 * dropped. `pagehide` and unmount make a best-effort flush.
 */
export function useAutosave({
  key,
  draft,
  stored,
  beforeWrite,
}: {
  key: Key | null;
  draft: KeyDraft | null;
  stored: Shortcut | undefined;
  /** The last change to a settled valid draft, just before it is written: Options fills Name from a tab title. */
  beforeWrite?: (key: Key, shortcut: Shortcut) => Shortcut;
}): Autosave {
  const check: DraftCheck = key === null || draft === null ? { kind: 'same' } : checkDraft(draft, stored);
  // The keymap is re-read whole on every change, so `stored` is a new object even when this key didn't change.
  const checked = JSON.stringify(check);
  const [failed, setFailed] = useState(false);
  const pending = useRef<Pending | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestBeforeWrite = useRef(beforeWrite);
  latestBeforeWrite.current = beforeWrite;

  const write = useCallback(async () => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (next === null) return;
    const shortcut = latestBeforeWrite.current?.(next.key, next.shortcut) ?? next.shortcut;
    const result = await writeChange(put(next.key, shortcut));
    if (!result.ok) {
      console.error('SpeedLink: could not save', next.key, result.error);
      setFailed(true);
    }
  }, []);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    pending.current = null;
  }, []);

  // A new edit, a stored change or a key switch: re-arm, keep or drop the pending write.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `checked` stands for `check`'s content
  useEffect(() => {
    if (pending.current !== null && pending.current.key !== key) void write();
    setFailed(false);
    if (key === null || check.kind !== 'valid') {
      cancel();
      return;
    }
    pending.current = { key, shortcut: check.shortcut };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void write(), AUTOSAVE_MS);
  }, [key, checked, write, cancel]);

  useEffect(() => {
    const onPageHide = () => void write();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      void write();
    };
  }, [write]);

  const state: SaveState = failed
    ? 'error'
    : check.kind === 'same'
      ? 'saved'
      : check.kind === 'invalid'
        ? 'invalid'
        : 'pending';
  return { state, flush: write, cancel };
}
