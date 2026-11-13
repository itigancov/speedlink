import type { ContentScriptContext } from '#imports';
import { createOverlaySlot, type OverlayMode, OverlayRegion } from '@/components/Overlay';
import { createToastSlot, type OccupiedSource, ToastRegion } from '@/components/ToastRegion';
import type { HoldCancelReason, HudEvent } from '@/domain/hud-state';
import type { Key } from '@/domain/keys';
import type { OverlayModel } from '@/domain/overlay-model';
import { createHoldTracker, type HoldEffects } from '@/platform/hold-tracker';
import { createKeyCapture } from '@/platform/key-capture';
import { onMessage, type PageToastData, type PageToastErrorReason, sendMessage } from '@/platform/messaging';
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
    // The HUD lives in the top frame only (§4.4); `sendToTab` targets frame 0. A sub-frame relays its Peek there.
    const hud = window === window.top ? createHud(ctx, occupied, (event) => holdTracker.dispatch(event)) : undefined;
    const holdTracker = createHoldTracker({
      os: browserOs(),
      frame: hud === undefined ? 'sub' : 'top',
      effects: hud?.overlay ?? RELAY_TO_TOP,
      isHudField: hud?.isHudField,
    });
    const capture = createKeyCapture({
      os: browserOs(),
      isAssigned: occupied.isAssigned,
      holdTracker,
      isInvalid: () => ctx.isInvalid,
      // An open closes the pinned overlay; a free key's toast then shows on the page.
      openKey: (request) => {
        holdTracker.dispatch({ kind: 'opened' });
        return sendMessage('openKey', request);
      },
      toggle: () => holdTracker.dispatch({ kind: 'toggle' }),
      isHudField: hud?.isHudField,
    });
    ctx.addEventListener(window, 'keydown', capture.keydown, { capture: true });
    ctx.addEventListener(window, 'keyup', capture.keyup, { capture: true });
    // What else stops a hold. A press on the overlay itself is not one: its tiles and scrim act on their own.
    const cancelOutside = (reason: HoldCancelReason) => (event: Event) => {
      if (!hud?.contains(event)) holdTracker.cancel(reason);
    };
    ctx.addEventListener(window, 'mousedown', cancelOutside('mousedown'), { capture: true });
    ctx.addEventListener(window, 'wheel', cancelOutside('wheel'), { capture: true, passive: true });
    ctx.addEventListener(window, 'blur', (event) => {
      if (event.target === window) holdTracker.cancel('blur');
    });
    ctx.addEventListener(document, 'visibilitychange', () => holdTracker.cancel('visibilitychange'));
    const removePing = onMessage('ping', () => true as const);
    const removeHud = hud?.register() ?? (() => {});

    ctx.onInvalidated(() => {
      safely(removePing);
      safely(removeHud);
      safely(occupied.dispose);
      safely(holdTracker.dispose);
    });
  },
});

/**
 * A sub-frame's hold effects: it never renders, and tells the top frame through the background. Each event waits
 * for the one before, so a quick release can't close before the show arrives.
 */
let relayed = Promise.resolve();
const RELAY_TO_TOP: HoldEffects = {
  fetchModel: () => {},
  show: () => {},
  pin: () => {},
  close: () => {},
  relay: (kind) => {
    relayed = relayed
      .then(() => sendMessage('frameEvent', { kind }))
      .catch((error: unknown) => console.debug('SpeedLink: could not relay', kind, error));
  },
};

/** The focused element, through open shadow roots: what the pinned overlay gives focus back to. */
function deepActiveElement(): HTMLElement | undefined {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : undefined;
}

/**
 * The top frame's HUD: toasts and the overlay in one shadow root, mounted the first time either is needed.
 * `overlay` runs the hold tracker's effects; `dispatch` feeds the tracker the overlay's own events. `register`
 * adds the key guard (call it synchronously, after key capture) and the message handlers, and returns their remover.
 */
function createHud(ctx: ContentScriptContext, occupied: OccupiedSource, dispatch: (event: HudEvent) => void) {
  const slot = createToastSlot();
  const overlaySlot = createOverlaySlot();
  const show = (toast: PageToastData) => {
    slot.show(toast);
    return hud.mount();
  };
  /**
   * Shows the error toast unless the request did what was asked. From this page, since the background never shows
   * errors; a request that never reached the background counts as failed.
   */
  const unlessDone = (key: Key, reason: PageToastErrorReason, request: Promise<boolean>) => {
    request
      .catch((error: unknown) => {
        console.debug('SpeedLink:', reason, key, error);
        return false;
      })
      .then((done) => (done ? undefined : show({ kind: 'error', key, reason })))
      .catch(() => {});
  };
  const hud = createHudMount(ctx, ({ keydowns }) => (
    <>
      <OverlayRegion
        slot={overlaySlot}
        keydowns={keydowns}
        actions={{
          open: (key, force) => {
            sendMessage('openKey', { key, force }).catch((error: unknown) =>
              console.debug('SpeedLink: could not ask to open', key, error),
            );
            dispatch({ kind: 'opened' });
          },
          edit: (key) => {
            sendMessage('openOptions', { key }).catch((error: unknown) =>
              console.debug('SpeedLink: could not open Options', key, error),
            );
            dispatch({ kind: 'close' });
          },
          openKeymap: () => {
            sendMessage('openOptions', undefined).catch((error: unknown) =>
              console.debug('SpeedLink: could not open Options', error),
            );
            dispatch({ kind: 'close' });
          },
          close: () => dispatch({ kind: 'close' }),
        }}
      />
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
            unlessDone(
              key,
              'save-failed',
              sendMessage('assignPage', { key }).then((reply) => reply.kind === 'saved'),
            );
          },
          // A successful Undo shows nothing more.
          undo: (key, id) => {
            unlessDone(
              key,
              'undo-stale',
              sendMessage('undo', { id }).then((reply) => reply.kind === 'undone'),
            );
          },
        }}
      />
    </>
  ));

  // The model asked for when a hold starts, and how the overlay should show, if at all. It appears once both are in;
  // a later request (a newer hold, a keymap change) wins over an earlier one still on its way.
  let request: Promise<OverlayModel | undefined> | undefined;
  let showing: OverlayMode | undefined;
  // Where focus was when the overlay pinned and its search took it.
  let returnFocus: HTMLElement | undefined;
  const fetchModel = () => {
    request = sendMessage('getOverlayModel', undefined).catch((error: unknown) => {
      console.debug('SpeedLink: no overlay model', error);
      return undefined;
    });
    hud.mount().catch((error: unknown) => console.debug('SpeedLink: could not mount the HUD', error));
  };
  const showLatest = () => {
    const pending = request;
    void pending?.then((model) => {
      if (showing !== undefined && request === pending && model !== undefined) overlaySlot.show(model, showing);
    });
  };
  const overlay: HoldEffects = {
    fetchModel,
    show: () => {
      showing = 'peek';
      showLatest();
    },
    pin: () => {
      showing = 'pinned';
      returnFocus = deepActiveElement();
      showLatest();
    },
    close: () => {
      const pinned = showing === 'pinned';
      showing = undefined;
      request = undefined;
      overlaySlot.hide();
      if (pinned && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      returnFocus = undefined;
    },
    relay: () => {},
  };

  return {
    overlay,
    contains: hud.contains,
    isHudField: hud.isHudField,
    register: () => {
      for (const type of ['keydown', 'keyup', 'keypress'] as const) {
        ctx.addEventListener(window, type, hud.guard, { capture: true });
      }
      // A key that changes while the overlay is up, in another window say: never show one that's gone.
      const unsubscribe = occupied.subscribe(() => {
        if (showing === undefined) return;
        fetchModel();
        showLatest();
      });
      const removeToast = onMessage('toast', async ({ data }) => {
        await show(data);
      });
      const removeFrameEvent = onMessage('frameEvent', ({ data }) => {
        dispatch({ kind: data.kind === 'show' ? 'remote-show' : data.kind === 'close' ? 'remote-close' : 'toggle' });
      });
      const removeOverlay = onMessage('overlay', () => dispatch({ kind: 'toggle' }));
      return () => {
        unsubscribe();
        removeToast();
        removeFrameEvent();
        removeOverlay();
      };
    },
  };
}
