import { createKeyCapture, createNoopHoldTracker } from '@/platform/key-capture';
import { onMessage, sendMessage } from '@/platform/messaging';
import { createOccupiedKeys } from '@/platform/occupied-keys';
import { browserOs } from '@/platform/platform-labels';

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

    ctx.onInvalidated(() => {
      safely(removePing);
      safely(occupied.dispose);
      safely(holdTracker.dispose);
    });
  },
});
