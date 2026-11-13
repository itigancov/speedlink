// The HUD's toast region (product spec §6): one slot, bottom centre. A new toast replaces the one showing and
// restarts its lifetime, even for the same key. Timed toasts pause while hovered and restart in full on leave.
// Untimed toasts close on × or Esc; Esc is only listened to, never taken from the page. The free-key toast also
// closes once its key is taken, so it never offers a key that is no longer free.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Key } from '@/domain/keys';
import type { PageToastData } from '@/platform/messaging';
import type { OccupiedKeys } from '@/platform/occupied-keys';
import { chordLabel, PLATFORM, type Platform } from '@/platform/platform-labels';
import { PageToast } from './PageToast';

/** How long each kind stays up on its own; `undefined` = until dismissed or replaced. */
const LIFETIME_MS: Record<PageToastData['kind'], number | undefined> = {
  free: undefined,
  switched: 3000,
  saved: 5000,
  error: 5000,
};

interface Shown {
  /** New for every `show`, so the same toast again restarts. */
  id: number;
  toast: PageToastData;
}

/** The one slot. Outside React, so the content script's message handler can `show` into it. */
export interface ToastSlot {
  show(toast: PageToastData): void;
  /** Clears the slot if `id` is still the toast showing. */
  dismiss(id: number): void;
  current(): Shown | undefined;
  subscribe(listener: () => void): () => void;
}

export function createToastSlot(): ToastSlot {
  let shown: Shown | undefined;
  let nextId = 1;
  const listeners = new Set<() => void>();
  const set = (next: Shown | undefined) => {
    shown = next;
    for (const listener of listeners) listener();
  };
  return {
    show: (toast) => set({ id: nextId++, toast }),
    dismiss: (id) => {
      if (shown?.id === id) set(undefined);
    },
    current: () => shown,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** What the toasts' actions do. Injected, so the region is testable without messaging. */
export interface ToastActions {
  /** Switched toast: open the shortcut in a new tab now (Force new tab). */
  openNew(key: Key): void;
  /** Free-key toast: put the current page on the key. */
  putPageOnKey(key: Key): void;
  /** Saved toast: take back the assign `undoId` names. The toast is already gone. */
  undo(key: Key, undoId: string): void;
}

/** Which keys hold a shortcut, and a call on every keymap change: the content script's `OccupiedKeys`. */
export type OccupiedSource = Pick<OccupiedKeys, 'isAssigned' | 'subscribe'>;

/** No keymap at all (the gallery): no key ever gets taken. */
const NO_KEYMAP: OccupiedSource = { isAssigned: () => false, subscribe: () => () => {} };

/** Subscribes to keydowns, without suppressing them; returns the unsubscribe. */
export type KeydownSource = (listener: (event: KeyboardEvent) => void) => () => void;

/** Every keydown that reaches `window`. The HUD passes its own source, which also sees keys inside the HUD. */
const windowKeydowns: KeydownSource = (listener) => {
  window.addEventListener('keydown', listener, true);
  return () => window.removeEventListener('keydown', listener, true);
};

export interface ToastRegionProps {
  slot: ToastSlot;
  actions: ToastActions;
  /** Closes the free-key toast when its key gets taken; defaults to a keymap where none ever is. */
  occupied?: OccupiedSource;
  /** Forces the chip's platform; defaults to the running platform. */
  platform?: Platform;
  keydowns?: KeydownSource;
}

function ShownToast({
  shown: { id, toast },
  slot,
  actions,
  occupied,
  platform,
  keydowns,
  hovered,
  setHovered,
}: Required<ToastRegionProps> & { shown: Shown; hovered: boolean; setHovered(hovered: boolean): void }) {
  const lifetime = LIFETIME_MS[toast.kind];

  useEffect(() => {
    if (lifetime === undefined || hovered) return;
    const timer = setTimeout(() => slot.dismiss(id), lifetime);
    return () => clearTimeout(timer);
  }, [slot, id, lifetime, hovered]);

  useEffect(() => {
    if (lifetime !== undefined) return;
    return keydowns((event) => {
      if (event.key === 'Escape') slot.dismiss(id);
    });
  }, [slot, id, lifetime, keydowns]);

  // Only a change counts: before the content script's first read every key reads as assigned.
  const freeKey = toast.kind === 'free' ? toast.key : undefined;
  useEffect(() => {
    if (freeKey === undefined) return;
    return occupied.subscribe(() => {
      if (occupied.isAssigned(freeKey)) slot.dismiss(id);
    });
  }, [slot, id, freeKey, occupied]);

  const chip = chordLabel(toast.key, platform);
  const hover = { onPointerEnter: () => setHovered(true), onPointerLeave: () => setHovered(false) };
  switch (toast.kind) {
    case 'free':
      return (
        <PageToast
          {...hover}
          chip={chip}
          tone="free"
          message={i18n.t('pageToast.free')}
          actionLabel={i18n.t('pageToast.putPageOnKey')}
          onAction={() => actions.putPageOnKey(toast.key)}
          onClose={() => slot.dismiss(id)}
          closeLabel={i18n.t('pageToast.close')}
        />
      );
    case 'switched':
      return (
        <PageToast
          {...hover}
          chip={chip}
          tone="switched"
          message={i18n.t('pageToast.switched', [toast.name])}
          actionLabel={i18n.t('pageToast.openNew')}
          onAction={() => actions.openNew(toast.key)}
        />
      );
    case 'saved':
      return (
        <PageToast
          {...hover}
          chip={chip}
          tone="saved"
          message={i18n.t('pageToast.saved', [toast.name])}
          actionLabel={i18n.t('pageToast.undo')}
          onAction={() => {
            // Gone first, so Undo can't be pressed twice.
            slot.dismiss(id);
            actions.undo(toast.key, toast.undoId);
          }}
        />
      );
    case 'error':
      return (
        <PageToast
          {...hover}
          chip={chip}
          tone="error"
          message={
            toast.reason === 'undo-stale' ? i18n.t('pageToast.undoStale') : i18n.t('pageToast.saveFailed', [chip])
          }
        />
      );
  }
}

export function ToastRegion({
  slot,
  actions,
  occupied = NO_KEYMAP,
  platform = PLATFORM,
  keydowns = windowKeydowns,
}: ToastRegionProps) {
  const shown = useSyncExternalStore(slot.subscribe, slot.current);
  // Here, not per toast: a toast that replaces one under the pointer is held too. An emptied slot gets no
  // pointerleave (the pill is gone), so it resets.
  const [hovered, setHovered] = useState(false);
  if (shown === undefined && hovered) setHovered(false);
  return (
    // The live region is always there, so the first toast is announced too. Only the pill catches pointer events.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center px-4"
    >
      {shown && (
        <ShownToast
          key={shown.id}
          shown={shown}
          slot={slot}
          actions={actions}
          occupied={occupied}
          platform={platform}
          keydowns={keydowns}
          hovered={hovered}
          setHovered={setHovered}
        />
      )}
    </div>
  );
}
