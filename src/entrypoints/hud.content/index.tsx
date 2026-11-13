import type { ContentScriptContext } from '#imports';
import { createToastSlot, type OccupiedSource, ToastRegion } from '@/components/ToastRegion';
import type { Key } from '@/domain/keys';
import { createKeyCapture, createNoopHoldTracker } from '@/platform/key-capture';
import type { PageToastData } from '@/platform/messaging';
import { onMessage, sendMessage } from '@/platform/messaging';
import { createOccupiedKeys } from '@/platform/occupied-keys';
import { browserOs } from '@/platform/platform-labels';
import { createHudMount } from './hud-mount';

/** Runs a teardown step in a context that may already be dead, where Chrome APIs throw. */
const safely = (dispose: () => void) => {
  try {
    dispose();
  } catch {
    // The extension context is gone; there is nothing left to remove.
  }
};

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  // The HUD's CSS is inlined into its shadow root (hud-mount.tsx), so nothing is injected into pages.
  cssInjectionMode: 'manual',
  main(ctx) {
    if (__SPEEDLINK_E2E_THROW__) {
      throw new Error('speedlink-e2e-negative-control');
    }

    // Everything is registered synchronously, before the page's own handlers can run (product spec §4.2). WXT's
    // `ctx` makes the newest copy win: a starting copy invalidates older ones in the same frame, and a copy whose
    // extension was reloaded or updated invalidates itself on its next event. Either way its listeners go.
    const occupied = createOccupiedKeys();
    const holdTracker = createNoopHoldTracker();
    const capture = createKeyCapture({
      os: browserOs(),
      isAssigned: occupied.isAssigned,
      holdTracker,
      isInvalid: () => ctx.isInvalid,
      openKey: (request) => sendMessage('openKey', request),
    });
    ctx.addEventListener(window, 'keydown', capture.keydown, { capture: true });
    ctx.addEventListener(window, 'keyup', capture.keyup, { capture: true });
    const removePing = onMessage('ping', () => true as const);
    // The HUD lives in the top frame only (§4.4); `sendToTab` targets frame 0.
    const removeToast = window === window.top ? registerHud(ctx, occupied) : () => {};

    ctx.onInvalidated(() => {
      safely(removePing);
      safely(removeToast);
      safely(occupied.dispose);
      safely(holdTracker.dispose);
    });
  },
});

/**
 * The top frame's HUD: the key guard now, synchronously after key capture; the shadow root on the first toast.
 * Returns the toast handler's remover.
 */
function registerHud(ctx: ContentScriptContext, occupied: OccupiedSource): () => void {
  const slot = createToastSlot();
  const show = (toast: PageToastData) => {
    slot.show(toast);
    return hud.mount();
  };
  /** A refused or failed request: the error toast, from this page, since the background never shows errors. */
  const showError = (key: Key, reason: 'undo-stale' | 'save-failed') => (error?: unknown) => {
    if (error !== undefined) console.debug('SpeedLink:', reason, key, error);
    void show({ kind: 'error', key, reason }).catch(() => {});
  };
  const hud = createHudMount(ctx, ({ keydowns }) => (
    <ToastRegion
      slot={slot}
      keydowns={keydowns}
      occupied={occupied}
      actions={{
        openNew: (key) => {
          sendMessage('openKey', { key, force: true }).catch((error: unknown) =>
            console.debug('SpeedLink: could not open new', key, error),
          );
        },
        // On `saved` the background's saved toast replaces the free one; anything else saved nothing.
        putPageOnKey: (key) => {
          sendMessage('assignPage', { key }).then(
            (reply) => {
              if (reply.kind !== 'saved') showError(key, 'save-failed')();
            },
            showError(key, 'save-failed'),
          );
        },
        // A successful Undo shows nothing more.
        undo: (key, id) => {
          sendMessage('undo', { id }).then(
            (reply) => {
              if (reply.kind !== 'undone') showError(key, 'undo-stale')();
            },
            showError(key, 'undo-stale'),
          );
        },
      }}
    />
  ));
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    ctx.addEventListener(window, type, hud.guard, { capture: true });
  }
  return onMessage('toast', async ({ data }) => {
    await show(data);
  });
}
